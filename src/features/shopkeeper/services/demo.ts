import type { Job, Snapshot, StoredDocument } from '../types';
import { calculateSnapshot } from './engine';

export function createSampleDocument(): StoredDocument {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
    '',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const first = 'BT /F1 22 Tf 60 750 Td (PrintQ fictional sample) Tj 0 -42 Td /F1 12 Tf (Generated locally. No student data or personal documents.) Tj ET';
  const second = 'BT /F1 22 Tf 60 750 Td (A better queue starts here.) Tj 0 -42 Td /F1 12 Tf (Page 2 - demonstration print preferences and paper savings.) Tj ET';
  objects[3] = `<< /Length ${first.length} >>\nstream\n${first}\nendstream`;
  objects[5] = `<< /Length ${second.length} >>\nstream\n${second}\nendstream`;
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object,index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10,'0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { id: 'sample-document', name: 'PrintQ-fictional-sample.pdf', mimeType: 'application/pdf', blob: new Blob([pdf], { type: 'application/pdf' }) };
}
export function createDemoSnapshot(now = Date.now()): Snapshot {
  const at = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
  const names = ['Workshop handout', 'Campus design brief', 'Systems practice workbook', 'Seminar outline', 'Illustration portfolio', 'Lab submission', 'Project abstract', 'Pickup demonstration', 'Study planner', 'Club poster'];
  const pages = [14,2,32,3,12,5,7,8,6,2], copies = [1,8,1,1,1,1,2,1,1,3];
  const ages = [25,45,65,10,8,12,3,90,180,240];
  const jobs: Job[] = names.map((name,index) => {
    const number = index + 1, status: Job['status'] = number === 1 ? 'printing' : number === 8 ? 'ready' : number >= 9 ? 'collected' : 'queued';
    const urgent = number === 6, pending = number === 7;
    return { id: `demo-job-${number}`, token: `PQ-2026-${1000 + number}`, documentName: name, documentId: number === 2 ? 'sample-document' : null,
      originalFileName: number === 2 ? 'PrintQ-fictional-sample.pdf' : null, mimeType: number === 2 ? 'application/pdf' : null, fileSize: number === 2 ? createSampleDocument().blob.size : null,
      pageCount: pages[index], copies: copies[index], colorMode: number === 5 || number === 10 ? 'colour' : 'bw', duplex: number % 2 === 0, paperSize: 'A4', instructions: number === 5 ? 'Keep illustrations in colour.' : '',
      status, priority: urgent ? 'urgent' : 'normal', urgentRequestStatus: urgent ? 'approved' : pending ? 'pending' : 'none', urgentRequestedAt: urgent ? at(11) : pending ? at(2) : null,
      queuePosition: status === 'queued' ? ({2:2,3:3,4:4,5:5,6:1,7:6} as Record<number,number>)[number] : null,
      estimatedCost: 0, estimatedDurationMinutes: 0, estimatedWaitMinutes: null, estimatedPickupAt: null, pickupWindowEnd: null,
      createdAt: at(ages[index]), updatedAt: status === 'printing' ? at(2) : urgent ? at(11) : pending ? at(2) : status === 'queued' ? at(ages[index]) : at(number === 8 ? 15 : 45),
      printingStartedAt: status === 'queued' ? null : at(number === 1 ? 2 : number === 8 ? 25 : 70), readyAt: status === 'ready' || status === 'collected' ? at(number === 8 ? 15 : 55) : null,
      collectedAt: status === 'collected' ? at(45) : null, remainingMinutes: status === 'printing' ? 1 + pages[index] * .4 : null };
  });
  return calculateSnapshot({ revision: 0, jobs, settings: { shopName: 'North Campus Print Studio', bwPrice: 2, colourPrice: 10, pickupBufferMinutes: 15, opensAt: '08:00', closesAt: '20:00' },
    printer: { state: 'operational', downtimeMinutes: null, changedAt: at(120), recordedDowntimeMinutes: 0 },
    activity: [{ id: 'demo-seeded', at: at(0), message: 'Fictional demo loaded. Documents and data stay in this browser.', jobId: null }], mode: 'demo' }, now);
}
