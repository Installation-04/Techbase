// Service reports: signature validation and PDF generation.
// pdfkit is pure JS (its Helvetica metrics ship in the package), so it runs in
// the stock node:alpine image with no system libraries.

const SIGNATURE_MAX_BYTES = 64 * 1024; // decoded PNG; the JSON body limit (100 kB) is the outer bound
const SIGNATURE_MAX_DIMENSION = 2000; // px, per side
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DATA_URL_RE = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

class SignatureError extends Error {}

// Accepts a "data:image/png;base64,..." string and returns the PNG bytes, or
// throws SignatureError (message in French, safe to show to the user). The
// bytes are checked, not just the declared type: PNG signature + a sane IHDR.
function parseSignatureDataUrl(value) {
  if (typeof value !== 'string') throw new SignatureError('Signature invalide');
  // Bound the work before decoding anything.
  if (value.length > Math.ceil((SIGNATURE_MAX_BYTES * 4) / 3) + 64) throw new SignatureError('Signature trop volumineuse');
  const match = DATA_URL_RE.exec(value);
  if (!match) throw new SignatureError('La signature doit être une image PNG');
  const buf = Buffer.from(match[1], 'base64');
  if (buf.length > SIGNATURE_MAX_BYTES) throw new SignatureError('Signature trop volumineuse');
  if (buf.length < 33 || !buf.subarray(0, 8).equals(PNG_MAGIC) || buf.toString('latin1', 12, 16) !== 'IHDR') {
    throw new SignatureError('La signature doit être une image PNG');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (!width || !height || width > SIGNATURE_MAX_DIMENSION || height > SIGNATURE_MAX_DIMENSION) {
    throw new SignatureError('Dimensions de signature invalides');
  }
  return buf;
}

function formatMinutes(min) {
  if (min === null || min === undefined || min === '') return '';
  const n = Number(min);
  if (!Number.isFinite(n)) return '';
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

function formatFrDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}

// Builds the PDF and resolves with a Buffer.
// data: { company, workOrder, client, report, signature (Buffer|null), generatedAt }
function buildServiceReportPdf(data) {
  const PDFDocument = require('pdfkit');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Rapport d'intervention - ${data.workOrder.title}` } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const { workOrder, client, report } = data;
      const left = doc.page.margins.left;
      const width = doc.page.width - left - doc.page.margins.right;

      // Header band
      doc.rect(0, 0, doc.page.width, 80).fill('#1d4ed8');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(data.company || 'TechIBase', left, 28, { width });
      doc.font('Helvetica').fontSize(10).text("Rapport d'intervention", left, 54, { width });
      doc.fillColor('#000000');
      doc.y = 100;

      const section = (title) => {
        doc.moveDown(0.8);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#1d4ed8').text(title, left, doc.y, { width });
        doc.moveTo(left, doc.y + 1).lineTo(left + width, doc.y + 1).strokeColor('#cbd5e1').stroke();
        doc.moveDown(0.4);
        doc.fillColor('#000000').font('Helvetica').fontSize(10.5);
      };
      const field = (label, value) => {
        if (!value) return;
        doc.font('Helvetica-Bold').text(`${label} : `, left, doc.y, { continued: true, width });
        doc.font('Helvetica').text(String(value));
      };
      const block = (label, value) => {
        if (!value) return;
        doc.font('Helvetica-Bold').text(label, left, doc.y, { width });
        doc.font('Helvetica').text(String(value), left, doc.y, { width });
        doc.moveDown(0.5);
      };

      section('Client');
      field('Nom', client.name);
      field('Adresse', client.address);
      field('Téléphone', client.phone);
      field('N° de contrat', client.contract_number);

      section('Bon de service');
      field('Numéro', `#${workOrder.id}`);
      field('Titre', workOrder.title);
      field('Équipement', workOrder.equipment_name);
      field('Technicien', workOrder.assigned_to_name);
      field('Échéance', formatFrDate(workOrder.due_date));
      block('Description', workOrder.description);

      section("Rapport d'intervention");
      block('Travaux effectués', report.work_done);
      block('Pièces utilisées', report.parts_used);
      field('Temps passé', formatMinutes(report.time_spent_minutes));
      if (report.time_spent_minutes) doc.moveDown(0.5);
      block('Observations', report.observations);

      // Signature block must not split across pages.
      if (doc.y > doc.page.height - 230) doc.addPage();
      section('Signature du client');
      if (data.signature) {
        doc.image(data.signature, left, doc.y, { fit: [260, 100] });
        doc.y += 106;
        doc.font('Helvetica').fontSize(10);
        field('Signataire', report.signer_name);
        field('Signé le', formatFrDate(report.signed_at));
      } else {
        doc.font('Helvetica-Oblique').text('Non signé', left, doc.y, { width });
      }

      doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
        .text(`Document généré le ${formatFrDate(data.generatedAt || new Date())}`, left, doc.page.height - 60, { width, align: 'right' });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  SIGNATURE_MAX_BYTES,
  SignatureError,
  parseSignatureDataUrl,
  buildServiceReportPdf,
  formatMinutes,
};
