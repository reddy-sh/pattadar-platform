import { jsPDF } from 'jspdf';
import type { Course } from '../domain/types';

function safeFilename(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function downloadCourseGuide(course: Course): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 52;
  let y = 58;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PATTADAR UNIVERSITY', left, y);
  y += 34;
  doc.setFontSize(24);
  doc.text(doc.splitTextToSize(course.title, 490), left, y);
  y += 62;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(doc.splitTextToSize(course.summary, 490), left, y);
  y += 56;
  doc.setFont('helvetica', 'bold');
  doc.text('Learning outcome', left, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(course.outcome, 490), left, y);
  y += 52;
  doc.setFont('helvetica', 'bold');
  doc.text('Course plan', left, y);
  y += 22;
  doc.setFont('helvetica', 'normal');
  for (const [index, module] of course.modules.entries()) {
    doc.text(`${index + 1}. ${module.title}  ·  ${module.minutes} min`, left, y);
    y += 22;
  }
  y += 18;
  doc.setFontSize(9);
  doc.text(
    doc.splitTextToSize(
      `${course.credential}. This learning material is educational and does not replace legal, survey, engineering, or government advice. Content version ${course.contentVersion}.`,
      490,
    ),
    left,
    y,
  );
  doc.save(`${safeFilename(course.title)}-guide.pdf`);
}

export function downloadCertificate(course: Course, learnerName: string): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setLineWidth(1);
  doc.rect(36, 36, 770, 523);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PATTADAR UNIVERSITY', 421, 105, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(34);
  doc.text('Certificate of completion', 421, 190, { align: 'center' });
  doc.setFontSize(14);
  doc.text('awarded to', 421, 235, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text(learnerName, 421, 280, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('for completing', 421, 325, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);
  doc.text(course.title, 421, 365, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${course.credential} · Content ${course.contentVersion}`, 421, 430, { align: 'center' });
  doc.text('Industry learning credential. Verify status with Pattadar before relying on it.', 421, 478, { align: 'center' });
  doc.save(`${safeFilename(course.title)}-certificate.pdf`);
}
