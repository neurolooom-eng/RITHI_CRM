import { db } from './db';
import { C } from '../modules/collections';

// Seed realistic medical-domain demo data once (idempotent). IDs are stable so
// cross-references between collections resolve.
export function seedDemoData() {
  const today = new Date();
  const iso = (offsetDays: number) =>
    new Date(today.getTime() + offsetDays * 86400000).toISOString().slice(0, 10);

  // ---- parties ----
  db.seedIfEmpty(C.parties, [
    { id: 'pty1', code: 'PTY-0001', name: 'Apollo Speciality Hospital', type: 'Hospital', city: 'Chennai', state: 'Tamil Nadu', contactPerson: 'Dr. Karthik', designation: 'Biomedical Head', phone: '9840012345', email: 'biomed@apollo.in', gstin: '33AABCA1234A1Z5' },
    { id: 'pty2', code: 'PTY-0002', name: 'Sunrise Diagnostics', type: 'Diagnostic Lab', city: 'Bengaluru', state: 'Karnataka', contactPerson: 'Meera Iyer', designation: 'Lab Manager', phone: '9900087654', email: 'lab@sunrise.in' },
    { id: 'pty3', code: 'PTY-0003', name: 'CityCare Nursing Home', type: 'Nursing Home', city: 'Hyderabad', state: 'Telangana', contactPerson: 'Sister Anil', phone: '9876512340' },
    { id: 'pty4', code: 'PTY-0004', name: 'Government Medical College', type: 'Medical College', city: 'Kochi', state: 'Kerala', contactPerson: 'Prof. Nair', phone: '9447011223' },
  ]);

  // ---- products ----
  db.seedIfEmpty(C.products, [
    { id: 'prd1', code: 'PRD-0001', name: 'Multipara Patient Monitor MX-700', category: 'Patient Monitoring', modelNo: 'MX-700', manufacturer: 'RITHI Medical', listPrice: 185000, gstRate: 12, warrantyMonths: 24, pmFrequency: 'Quarterly', hsnCode: '9018' },
    { id: 'prd2', code: 'PRD-0002', name: 'Defibrillator DF-200', category: 'Life Support', modelNo: 'DF-200', manufacturer: 'RITHI Medical', listPrice: 320000, gstRate: 12, warrantyMonths: 24, pmFrequency: 'Half-Yearly', hsnCode: '9018' },
    { id: 'prd3', code: 'PRD-0003', name: 'Hematology Analyzer HA-5', category: 'Laboratory', modelNo: 'HA-5', manufacturer: 'RITHI Diagnostics', listPrice: 540000, gstRate: 12, warrantyMonths: 12, pmFrequency: 'Quarterly', hsnCode: '9027' },
    { id: 'prd4', code: 'PRD-0004', name: 'Digital X-Ray DRX-1', category: 'Imaging', modelNo: 'DRX-1', manufacturer: 'RITHI Imaging', listPrice: 1450000, gstRate: 12, warrantyMonths: 12, pmFrequency: 'Quarterly', hsnCode: '9022' },
    { id: 'prd5', code: 'PRD-0005', name: 'Syringe Infusion Pump SP-12', category: 'Life Support', modelNo: 'SP-12', manufacturer: 'RITHI Medical', listPrice: 48000, gstRate: 12, warrantyMonths: 24, pmFrequency: 'Yearly', hsnCode: '9018' },
  ]);

  // ---- parts ----
  db.seedIfEmpty(C.parts, [
    { id: 'spr1', code: 'SPR-0001', name: 'SpO2 Sensor Cable', partNo: 'CBL-SPO2', category: 'Sensor', compatibleProductId: 'prd1', unitPrice: 3200, gstRate: 18, uom: 'Nos', stockQty: 14, reorderLevel: 5, binLocation: 'A-12' },
    { id: 'spr2', code: 'SPR-0002', name: 'Defib Battery Pack', partNo: 'BAT-DF200', category: 'Battery', compatibleProductId: 'prd2', unitPrice: 9800, gstRate: 18, uom: 'Nos', stockQty: 3, reorderLevel: 4, binLocation: 'B-03' },
    { id: 'spr3', code: 'SPR-0003', name: 'Analyzer Reagent Probe', partNo: 'PRB-HA5', category: 'Mechanical', compatibleProductId: 'prd3', unitPrice: 5400, gstRate: 18, uom: 'Nos', stockQty: 8, reorderLevel: 3, binLocation: 'C-07' },
    { id: 'spr4', code: 'SPR-0004', name: 'X-Ray Detector PCB', partNo: 'PCB-DRX1', category: 'PCB / Board', compatibleProductId: 'prd4', unitPrice: 86000, gstRate: 18, uom: 'Nos', stockQty: 1, reorderLevel: 2, binLocation: 'D-01' },
    { id: 'spr5', code: 'SPR-0005', name: 'Pump Drive Motor', partNo: 'MOT-SP12', category: 'Mechanical', compatibleProductId: 'prd5', unitPrice: 4100, gstRate: 18, uom: 'Nos', stockQty: 6, reorderLevel: 3, binLocation: 'A-20' },
  ]);

  // ---- warranties ----
  db.seedIfEmpty(C.warranties, [
    { id: 'wty1', code: 'WTY-0001', partyId: 'pty1', productId: 'prd1', serialNo: 'MX700-2401', saleDate: iso(-200), startDate: iso(-200), endDate: iso(530), status: 'Active', invoiceNo: 'SI-1001' },
    { id: 'wty2', code: 'WTY-0002', partyId: 'pty2', productId: 'prd3', serialNo: 'HA5-1188', saleDate: iso(-340), startDate: iso(-340), endDate: iso(25), status: 'Expiring Soon', invoiceNo: 'SI-1002' },
    { id: 'wty3', code: 'WTY-0003', partyId: 'pty3', productId: 'prd5', serialNo: 'SP12-7741', saleDate: iso(-120), startDate: iso(-120), endDate: iso(610), status: 'Active' },
  ]);

  // ---- contracts ----
  db.seedIfEmpty(C.contracts, [
    { id: 'amc1', code: 'AMC-0001', partyId: 'pty1', productId: 'prd2', serialNo: 'DF200-3321', type: 'AMC (Comprehensive)', startDate: iso(-60), endDate: iso(305), pmVisitsPerYear: 2, value: 45000, status: 'Active', scope: 'All parts + labour' },
    { id: 'amc2', code: 'AMC-0002', partyId: 'pty4', productId: 'prd4', serialNo: 'DRX1-0091', type: 'CMC', startDate: iso(-300), endDate: iso(65), pmVisitsPerYear: 4, value: 180000, status: 'Active', scope: 'Comprehensive incl. detector' },
  ]);

  // ---- installations ----
  db.seedIfEmpty(C.installations, [
    { id: 'ins1', code: 'INS-0001', partyId: 'pty1', productId: 'prd1', serialNo: 'MX700-2401', callDate: iso(-198), priority: 'Medium', engineer: 'Ravi Menon', scheduledDate: iso(-197), siteReadiness: 'Ready', status: 'Closed', closureDate: iso(-196), resolution: 'Installed & commissioned. Staff trained.', timeSpentHrs: 4 },
    { id: 'ins2', code: 'INS-0002', partyId: 'pty4', productId: 'prd4', serialNo: 'DRX1-0091', callDate: iso(-5), priority: 'High', engineer: 'Suresh Kumar', scheduledDate: iso(-2), siteReadiness: 'Pending Electrical', status: 'In Progress' },
  ]);

  // ---- pm calls ----
  db.seedIfEmpty(C.pmcalls, [
    { id: 'pm1', code: 'PM-0001', contractId: 'amc1', partyId: 'pty1', productId: 'prd2', serialNo: 'DF200-3321', frequency: 'Half-Yearly', dueDate: iso(-3), engineer: 'Ravi Menon', visitDate: iso(-3), status: 'Completed', checklist: 'Battery OK, energy delivery verified.', nextDueDate: iso(180) },
    { id: 'pm2', code: 'PM-0002', contractId: 'amc2', partyId: 'pty4', productId: 'prd4', serialNo: 'DRX1-0091', frequency: 'Quarterly', dueDate: iso(-2), engineer: 'Suresh Kumar', status: 'Overdue' },
    { id: 'pm3', code: 'PM-0003', contractId: 'amc2', partyId: 'pty4', productId: 'prd4', serialNo: 'DRX1-0091', frequency: 'Quarterly', dueDate: iso(7), status: 'Scheduled' },
  ]);

  // ---- breakdowns ----
  db.seedIfEmpty(C.breakdowns, [
    { id: 'bd1', code: 'BD-0001', partyId: 'pty1', productId: 'prd1', serialNo: 'MX700-2401', reportedDate: iso(-12), reportedVia: 'Phone', priority: 'High', complaint: 'SpO2 reading intermittent / dropping out', underContract: true, engineer: 'Ravi Menon', scheduledDate: iso(-11), failureCategory: 'Sensor / Probe', rootCause: 'Frayed SpO2 sensor cable', status: 'Closed', closureDate: iso(-10), resolution: 'Replaced SpO2 sensor cable, verified readings', timeSpentHrs: 2 },
    { id: 'bd2', code: 'BD-0002', partyId: 'pty2', productId: 'prd3', serialNo: 'HA5-1188', reportedDate: iso(-8), reportedVia: 'Email', priority: 'Critical', complaint: 'Analyzer aborting runs with probe error', underContract: false, engineer: 'Ravi Menon', failureCategory: 'Mechanical', rootCause: 'Worn reagent probe', status: 'Closed', closureDate: iso(-6), resolution: 'Replaced reagent probe, recalibrated', timeSpentHrs: 3.5 },
    { id: 'bd3', code: 'BD-0003', partyId: 'pty4', productId: 'prd4', serialNo: 'DRX1-0091', reportedDate: iso(-2), reportedVia: 'Portal', priority: 'Critical', complaint: 'No image output on X-ray detector', underContract: true, engineer: 'Suresh Kumar', failureCategory: 'Electronic / PCB', status: 'In Progress' },
    { id: 'bd4', code: 'BD-0004', partyId: 'pty3', productId: 'prd5', serialNo: 'SP12-7741', reportedDate: iso(0), reportedVia: 'WhatsApp', priority: 'Medium', complaint: 'Infusion pump motor noisy & occasional occlusion alarm', underContract: true, status: 'Open' },
    { id: 'bd5', code: 'BD-0005', partyId: 'pty1', productId: 'prd1', serialNo: 'MX700-2402', reportedDate: iso(-40), reportedVia: 'Phone', priority: 'Low', complaint: 'Display flickering', underContract: true, engineer: 'Ravi Menon', failureCategory: 'Display', rootCause: 'Loose display ribbon', status: 'Closed', closureDate: iso(-39), resolution: 'Reseated ribbon cable', timeSpentHrs: 1 },
  ]);

  // ---- spare requests ----
  db.seedIfEmpty(C.spareRequests, [
    { id: 'req1', code: 'REQ-0001', callId: 'bd3', partId: 'spr4', qty: 1, engineer: 'Suresh Kumar', requestDate: iso(-1), priority: 'Critical', status: 'Approved', approvedBy: 'Suresh Kumar', reason: 'Detector PCB failure' },
    { id: 'req2', code: 'REQ-0002', callId: 'bd4', partId: 'spr5', qty: 1, engineer: 'Ravi Menon', requestDate: iso(0), priority: 'Medium', status: 'Pending' },
  ]);

  // ---- spare consumption ----
  db.seedIfEmpty(C.spareConsumption, [
    { id: 'con1', code: 'CON-0001', callId: 'bd1', partId: 'spr1', qty: 1, engineer: 'Ravi Menon', consumeDate: iso(-10), billable: false, remarks: 'Under warranty' },
    { id: 'con2', code: 'CON-0002', callId: 'bd2', partId: 'spr3', qty: 1, engineer: 'Ravi Menon', consumeDate: iso(-6), billable: true, remarks: 'Out of warranty — chargeable' },
  ]);

  // ---- feedback ----
  db.seedIfEmpty(C.feedback, [
    { id: 'fbk1', code: 'FBK-0001', partyId: 'pty1', callId: 'bd1', rating: 5, responseTime: 'Excellent', engineerConduct: 'Excellent', recommend: 'Yes', feedbackDate: iso(-9), comments: 'Very prompt and professional.' },
    { id: 'fbk2', code: 'FBK-0002', partyId: 'pty2', callId: 'bd2', rating: 4, responseTime: 'Good', engineerConduct: 'Excellent', recommend: 'Yes', feedbackDate: iso(-5), comments: 'Resolved quickly, slight delay in parts.' },
  ]);

  // ---- quotes ----
  db.seedIfEmpty(C.quotes, [
    { id: 'qt1', code: 'QT-0001', kind: 'quote', partyId: 'pty3', docDate: iso(-4), status: 'Issued', notes: 'Valid 30 days', items: [
      { id: 'li1', kind: 'product', refId: 'prd5', description: 'Syringe Infusion Pump SP-12', qty: 2, rate: 48000, gst: 12 },
      { id: 'li2', kind: 'spare', refId: 'spr5', description: 'Pump Drive Motor', qty: 1, rate: 4100, gst: 18 },
    ] },
  ]);

  // ---- invoices ----
  db.seedIfEmpty(C.invoices, [
    { id: 'inv1', code: 'INV-0001', kind: 'invoice', partyId: 'pty2', docDate: iso(-5), status: 'Issued', paymentStatus: 'Unpaid', notes: 'Out-of-warranty spare', items: [
      { id: 'li3', kind: 'spare', refId: 'spr3', description: 'Analyzer Reagent Probe', qty: 1, rate: 5400, gst: 18 },
    ] },
  ]);
}
