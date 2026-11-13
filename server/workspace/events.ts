import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { Pool, PoolClient } from 'pg';
import type { AuthenticatedSession } from '../auth/session.ts';
import { projectStudentObservation, type WorkspaceObservation } from '../../src/shared/printq/workspace.ts';

export interface WorkspaceEventBusOptions {
  pool: Pool;
  getObservation: () => Promise<WorkspaceObservation>;
  aliasForId: (jobId: string) => string;
  schema?: string;
}

interface SseClient {
  id: string;
  res: Response;
  session: AuthenticatedSession;
  lastRevision: number;
}

export class WorkspaceEventBus {
  private readonly pool: Pool;
  private readonly getObservation: () => Promise<WorkspaceObservation>;
  private readonly aliasForId: (jobId: string) => string;
  private readonly channelName: string;
  private readonly epoch: string = crypto.randomUUID();

  private readonly clients = new Map<string, SseClient>();
  private listenClient: PoolClient | null = null;
  private tickerTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private downtimeTimer: ReturnType<typeof setTimeout> | null = null;
  private broadcastInFlight = false;
  private broadcastPending = false;
  private closed = false;

  constructor(options: WorkspaceEventBusOptions) {
    this.pool = options.pool;
    this.getObservation = options.getObservation;
    this.aliasForId = options.aliasForId;
    this.channelName = options.schema && options.schema !== 'printq'
      ? `${options.schema}_workspace_changed`
      : 'printq_workspace_changed';
  }

  get clientCount(): number {
    return this.clients.size;
  }

  async handleSseConnection(req: Request, res: Response, session: AuthenticatedSession): Promise<void> {
    if (this.closed) {
      res.status(503).json({ error: { code: 'SERVER_SHUTTING_DOWN', message: 'Server is shutting down.' } });
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const clientId = crypto.randomUUID();
    const client: SseClient = {
      id: clientId,
      res,
      session,
      lastRevision: -1,
    };

    this.clients.set(clientId, client);
    this.writeEvent(res, 'connection-state', { status: 'connected', epoch: this.epoch });

    req.on('close', () => {
      this.clients.delete(clientId);
      if (this.clients.size === 0) {
        this.stopActiveWatchers();
      }
    });

    await this.ensureActiveWatchers();

    try {
      const observation = await this.getObservation();
      if (this.clients.has(clientId)) {
        this.sendSnapshotEvent(client, observation);
        this.scheduleDowntimeExpiry(observation);
      }
    } catch {
      // Initial observation failure will be retried on next tick or notify
    }
  }

  async notifyChanged(): Promise<void> {
    if (this.closed || this.clients.size === 0) {
      return;
    }
    await this.broadcastLatest();
  }

  async close(): Promise<void> {
    this.closed = true;
    this.stopActiveWatchers();
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        // Ignore response close errors
      }
    }
    this.clients.clear();
    if (this.listenClient) {
      const client = this.listenClient;
      this.listenClient = null;
      try {
        await client.query(`UNLISTEN ${this.channelName}`);
      } catch {
        // Ignore unlisten errors
      }
      client.release();
    }
  }

  private async ensureActiveWatchers(): Promise<void> {
    if (this.closed) return;

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        for (const client of this.clients.values()) {
          try {
            client.res.write(': keepalive\n\n');
          } catch {
            this.clients.delete(client.id);
          }
        }
        if (this.clients.size === 0) {
          this.stopActiveWatchers();
        }
      }, 15_000);
      this.heartbeatTimer.unref();
    }

    if (!this.tickerTimer) {
      this.tickerTimer = setInterval(() => {
        void this.broadcastLatest();
      }, 15_000);
      this.tickerTimer.unref();
    }

    if (!this.listenClient) {
      try {
        const client = await this.pool.connect();
        if (this.closed || this.clients.size === 0) {
          client.release();
          return;
        }
        this.listenClient = client;
        client.on('notification', (msg) => {
          if (msg.channel === this.channelName) {
            void this.broadcastLatest();
          }
        });
        client.on('error', () => {
          if (this.listenClient === client) {
            this.listenClient = null;
            try {
              client.release(true);
            } catch {
              // Ignore release error
            }
          }
        });
        await client.query(`LISTEN ${this.channelName}`);
      } catch {
        // Fallback to 15s ticker if LISTEN fails
      }
    }
  }

  private stopActiveWatchers(): void {
    if (this.tickerTimer) {
      clearInterval(this.tickerTimer);
      this.tickerTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.downtimeTimer) {
      clearTimeout(this.downtimeTimer);
      this.downtimeTimer = null;
    }
  }

  private scheduleDowntimeExpiry(observation: WorkspaceObservation): void {
    if (this.downtimeTimer) {
      clearTimeout(this.downtimeTimer);
      this.downtimeTimer = null;
    }
    if (this.closed || this.clients.size === 0) {
      return;
    }
    const { printer } = observation.snapshot;
    if (printer.state === 'operational' || printer.downtimeMinutes === null) {
      return;
    }
    const changedMs = Date.parse(printer.changedAt);
    if (!Number.isFinite(changedMs)) {
      return;
    }
    const expiresAtMs = changedMs + printer.downtimeMinutes * 60_000;
    const delayMs = Math.max(0, expiresAtMs - Date.now()) + 50;
    this.downtimeTimer = setTimeout(() => {
      this.downtimeTimer = null;
      void this.broadcastLatest();
    }, delayMs);
    this.downtimeTimer.unref();
  }

  private async broadcastLatest(): Promise<void> {
    if (this.closed || this.clients.size === 0) {
      return;
    }
    if (this.broadcastInFlight) {
      this.broadcastPending = true;
      return;
    }
    this.broadcastInFlight = true;
    try {
      const observation = await this.getObservation();
      this.scheduleDowntimeExpiry(observation);
      for (const client of this.clients.values()) {
        if (client.lastRevision !== observation.snapshot.revision) {
          this.sendSnapshotEvent(client, observation);
        }
      }
    } catch {
      // Ignore transient observation errors; next tick/notify will retry
    } finally {
      this.broadcastInFlight = false;
      if (this.broadcastPending) {
        this.broadcastPending = false;
        void this.broadcastLatest();
      }
    }
  }

  private sendSnapshotEvent(client: SseClient, observation: WorkspaceObservation): void {
    const revision = observation.snapshot.revision;
    const student = projectStudentObservation(
      observation,
      client.session.user.id,
      this.aliasForId,
      'shared',
      null,
    );
    const payload = {
      epoch: this.epoch,
      revision,
      observedAt: observation.observedAt,
      student,
      ...(client.session.role === 'shopkeeper' ? { shopkeeper: observation.snapshot } : {}),
    };
    this.writeEvent(client.res, 'snapshot-changed', payload, String(revision));
    client.lastRevision = revision;
  }

  private writeEvent(res: Response, event: string, data: unknown, id?: string): void {
    const lines: string[] = [];
    if (id !== undefined) {
      lines.push(`id: ${id}`);
    }
    lines.push(`event: ${event}`);
    lines.push(`data: ${JSON.stringify(data)}`);
    res.write(`${lines.join('\n')}\n\n`);
  }
}
