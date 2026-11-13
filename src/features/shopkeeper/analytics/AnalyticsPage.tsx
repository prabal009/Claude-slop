import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Leaf } from 'lucide-react';
import { usePortal } from '../PortalContext';
import { Empty, PageHeader, Stat, money, minutes } from '../components/ui';
import type { Job } from '../types';

export function deriveAnalytics(jobs: Job[]) {
  const days = new Map<string, { date: string; jobs: number; saved: number; waitTotal: number; waitCount: number }>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, '0')}:00`, jobs: 0 }));
  let sheetsUsed = 0; let sheetsSaved = 0; let duplexJobs = 0; let printedJobs = 0; let waitTotal = 0; let waitCount = 0;
  for (const job of jobs) {
    const created = new Date(job.createdAt);
    const date = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
    const day = days.get(date) ?? { date, jobs: 0, saved: 0, waitTotal: 0, waitCount: 0 };
    day.jobs += 1; hours[created.getHours()].jobs += 1;
    const wait = job.printingStartedAt ? Math.max(0, (Date.parse(job.printingStartedAt) - created.getTime()) / 60000) : job.estimatedWaitMinutes;
    if (wait !== null && Number.isFinite(wait)) { waitTotal += wait; waitCount += 1; day.waitTotal += wait; day.waitCount += 1; }
    if (job.status === 'ready' || job.status === 'collected') {
      const baseline = job.pageCount * job.copies;
      const used = (job.duplex ? Math.ceil(job.pageCount / 2) : job.pageCount) * job.copies;
      const saved = baseline - used;
      sheetsUsed += used; sheetsSaved += saved; day.saved += saved; printedJobs += 1;
      if (job.duplex) duplexJobs += 1;
    }
    days.set(date, day);
  }
  return {
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(day => ({ ...day, wait: day.waitCount ? Math.round(day.waitTotal / day.waitCount * 10) / 10 : null })),
    hours, sheetsUsed, sheetsSaved, duplexJobs, printedJobs,
    averageWait: waitCount ? waitTotal / waitCount : null,
    averageDuration: jobs.length ? jobs.reduce((sum, job) => sum + job.estimatedDurationMinutes, 0) / jobs.length : null,
    modes: [{ name: 'B&W', value: jobs.filter(job => job.colorMode === 'bw').length }, { name: 'Colour', value: jobs.filter(job => job.colorMode === 'colour').length }],
    workload: jobs.filter(job => job.status === 'queued' || job.status === 'printing').sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0)).map(job => ({ token: job.token, minutes: job.status === 'printing' ? job.remainingMinutes ?? job.estimatedDurationMinutes : job.estimatedDurationMinutes })),
  };
}

export default function AnalyticsPage() {
  const { snapshot, t } = usePortal();
  const [range, setRange] = useState('all');
  const jobs = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    if (range !== 'all') start.setDate(start.getDate() - Number(range) + 1);
    return snapshot.jobs.filter(job => range === 'all' || Date.parse(job.createdAt) >= start.getTime());
  }, [snapshot.jobs, range]);
  const analytics = useMemo(() => deriveAnalytics(jobs), [jobs]);
  const duplexPercent = analytics.printedJobs ? analytics.duplexJobs / analytics.printedJobs * 100 : 0;
  const reduction = analytics.sheetsUsed + analytics.sheetsSaved ? analytics.sheetsSaved / (analytics.sheetsUsed + analytics.sheetsSaved) * 100 : 0;
  const modeData = analytics.modes.map(mode => ({ ...mode, name: t(mode.name) }));
  return <div className="page stack">
    <PageHeader title={t('Analytics & EcoPrint')} description={t('Every chart is calculated from the current local job records. No payment or carbon savings are inferred.')} actions={<label className="field">{t('Submission period')}<select value={range} onChange={e => setRange(e.target.value)}><option value="all">{t('All records')}</option><option value="7">{t('Last 7 days')}</option><option value="30">{t('Last 30 days')}</option></select></label>} />
    <div className="stats-grid">
      <Stat label={t('Submitted jobs')} value={jobs.length} /><Stat label={t('Collected jobs')} value={jobs.filter(job => job.status === 'collected').length} />
      <Stat label={t('Average estimated processing time')} value={minutes(analytics.averageDuration)} /><Stat label={t('Average waiting time')} value={minutes(analytics.averageWait)} detail={t('Recorded pre-print waits where available; otherwise current estimates. Unknown waits excluded.')} />
      <Stat label={t('Estimated printing value')} value={money(jobs.reduce((sum, job) => sum + job.estimatedCost, 0))} detail={t('All selected orders; not payment revenue')} />
      <Stat label={t('Urgent requests received / approved')} value={`${jobs.filter(job => job.urgentRequestedAt !== null).length} / ${jobs.filter(job => job.urgentRequestStatus === 'approved').length}`} />
      <Stat label={t('Recorded printer downtime')} value={minutes(snapshot.printer.recordedDowntimeMinutes)} detail={t('Lifetime recorded downtime; not limited by submission period')} />
    </div>
    {!jobs.length ? <Empty title={t('No jobs in this period')} description={t('Choose another submission period or add a demo job in settings.')} /> : <>
      <div className="two-column">
        <section className="panel"><div className="panel-header"><h2>{t('Print jobs over time')}</h2></div><div className="panel-body chart-box" style={{ height: 270 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.days} margin={{ right: 16, left: 0, bottom: 5 }}><CartesianGrid vertical={false} stroke="#dde1eb" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} width={35} /><Tooltip /><Bar dataKey="jobs" name={t('Submitted jobs')} fill="#5145cd" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
        <section className="panel"><div className="panel-header"><h2>{t('B&W vs colour')}</h2></div><div className="panel-body chart-box" style={{ height: 270 }}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={modeData} dataKey="value" nameKey="name" innerRadius="50%" outerRadius="78%" paddingAngle={2} label={({ name, value }) => `${name}: ${value}`}>{modeData.map((mode, index) => <Cell key={mode.name} fill={index ? '#087e85' : '#5145cd'} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div></section>
        <section className="panel"><div className="panel-header"><h2>{t('Printing demand by hour')}</h2></div><div className="panel-body chart-box" style={{ height: 270 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.hours}><CartesianGrid vertical={false} stroke="#dde1eb" /><XAxis dataKey="hour" interval={3} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} width={35} /><Tooltip /><Bar dataKey="jobs" name={t('Submitted jobs')} fill="#087e85" /></BarChart></ResponsiveContainer></div></section>
        <section className="panel"><div className="panel-header"><h2>{t('Average wait by submission date')}</h2></div><div className="panel-body chart-box" style={{ height: 270 }}><ResponsiveContainer width="100%" height="100%"><LineChart data={analytics.days}><CartesianGrid vertical={false} stroke="#dde1eb" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis width={35} /><Tooltip /><Line type="monotone" dataKey="wait" name={t('Average wait (min)')} stroke="#5145cd" strokeWidth={2} connectNulls={false} /></LineChart></ResponsiveContainer></div></section>
      </div>
      <section className="panel"><div className="panel-header"><h2>{t('Active queue workload')}</h2><span className="muted small">{t('Remaining estimated processing minutes per job')}</span></div>{analytics.workload.length ? <div className="panel-body chart-box" style={{ height: Math.max(220, Math.min(550, analytics.workload.length * 42)) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.workload} layout="vertical" margin={{ left: 40, right: 20 }}><CartesianGrid horizontal={false} stroke="#dde1eb" /><XAxis type="number" /><YAxis type="category" dataKey="token" width={110} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="minutes" name={t('Processing minutes')} fill="#5145cd" /></BarChart></ResponsiveContainer></div> : <Empty title={t('No active workload')} />}</section>
    </>}
    <section className="panel"><div className="panel-header"><h2 className="row"><Leaf size={20} />{t('EcoPrint · paper, not promises')}</h2></div><div className="panel-body stack">
      <p className="muted">{t('Paper figures include printed orders only: ready and collected jobs in the selected submission period. Sheets are estimated from page count, copies, and duplex settings.')}</p>
      <div className="stats-grid"><Stat label={t('Estimated sheets used')} value={analytics.sheetsUsed} /><Stat label={t('Estimated sheets saved')} value={analytics.sheetsSaved} /><Stat label={t('Duplex adoption')} value={`${duplexPercent.toFixed(1)}%`} detail={`${analytics.duplexJobs} ${t('double-sided')} / ${analytics.printedJobs - analytics.duplexJobs} ${t('single-sided')}`} /><Stat label={t('Overall paper reduction')} value={`${reduction.toFixed(1)}%`} detail={t('Compared with single-sided output for the same printed orders')} /></div>
      <p className="small muted">{t('Single-sided sheets = pages × copies. Double-sided sheets = ceil(pages / 2) × copies. Only double-sided jobs contribute savings.')}</p>
      {analytics.printedJobs ? <div className="chart-box" style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.days}><CartesianGrid vertical={false} stroke="#dde1eb" /><XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} width={35} /><Tooltip /><Bar dataKey="saved" name={t('Estimated sheets saved')} fill="#087e85" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : <Empty title={t('No printed orders yet')} description={t('Paper estimates appear when a job is marked ready.')} />}
    </div></section>
    {!!jobs.length && <details className="panel"><summary className="panel-header">{t('View chart data')}</summary><div className="panel-body stack"><div className="table-wrap"><table className="data-table"><caption>{t('Daily jobs, waiting time, and paper savings')}</caption><thead><tr><th>{t('Submission date')}</th><th>{t('Jobs')}</th><th>{t('Average wait (min)')}</th><th>{t('Sheets saved')}</th></tr></thead><tbody>{analytics.days.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.jobs}</td><td>{day.wait ?? t('Unavailable')}</td><td>{day.saved}</td></tr>)}</tbody></table></div><p>{modeData.map(mode => `${mode.name}: ${mode.value}`).join(' · ')}</p><div className="table-wrap"><table className="data-table"><caption>{t('Hourly demand')}</caption><thead><tr><th>{t('Hour')}</th><th>{t('Jobs')}</th></tr></thead><tbody>{analytics.hours.map(hour => <tr key={hour.hour}><td>{hour.hour}</td><td>{hour.jobs}</td></tr>)}</tbody></table></div><div className="table-wrap"><table className="data-table"><caption>{t('Active workload')}</caption><thead><tr><th>{t('Token')}</th><th>{t('Processing minutes')}</th></tr></thead><tbody>{analytics.workload.map(job => <tr key={job.token}><td>{job.token}</td><td>{job.minutes}</td></tr>)}</tbody></table></div></div></details>}
  </div>;
}
