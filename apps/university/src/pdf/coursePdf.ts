import type { Course } from '../domain/types';
import { contentForCourse } from '../content';
import { officialReferencesById } from '../data/officialReferences';
import { stateLandRecordByCode } from '../data/stateLandRecords';

function safeFilename(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

interface PdfOutput {
  output: (type: 'blob') => Blob;
}

function savePdf(doc: PdfOutput, filename: string): void {
  const url = URL.createObjectURL(doc.output('blob'));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadCourseGuide(course: Course): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 52;
  const width = 490;
  const bottom = 54;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 58;

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - bottom) return;
    doc.addPage();
    y = 58;
  };

  const write = (text: string, options: { size?: number; bold?: boolean; indent?: number; after?: number } = {}) => {
    const size = options.size ?? 10;
    const indent = options.indent ?? 0;
    const lineHeight = size * 1.42;
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width - indent);
    ensureSpace(lines.length * lineHeight + (options.after ?? 8));
    doc.text(lines, left + indent, y);
    y += lines.length * lineHeight + (options.after ?? 8);
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('PATTADAR UNIVERSITY', left, y);
  y += 34;
  write(course.title, { size: 24, bold: true, after: 18 });
  write(course.summary, { size: 11, after: 18 });
  const jurisdiction = course.jurisdictionScope === 'india-general'
    ? 'All India general practice'
    : course.stateCodes.map((code) => stateLandRecordByCode(code)?.name ?? code).join(', ');
  write(`Jurisdiction: ${jurisdiction}`, { size: 9, bold: true, after: 14 });
  write('Learning outcome', { size: 12, bold: true, after: 5 });
  write(course.outcome, { size: 10, after: 18 });
  write('Course plan', { size: 12, bold: true, after: 7 });
  for (const [index, module] of course.modules.entries()) write(`${index + 1}. ${module.title} | ${module.minutes} min`, { after: 5 });
  y += 10;
  write(
    `${course.credential}. This material is educational and does not replace legal, survey, engineering, safety, or government advice. Content version ${course.contentVersion}.`,
    { size: 9, after: 18 },
  );

  for (const [index, lesson] of contentForCourse(course).entries()) {
    ensureSpace(180);
    y += 8;
    write(`Lesson ${index + 1}`, { size: 9, bold: true, after: 5 });
    write(course.modules[index]?.title ?? lesson.moduleId, { size: 18, bold: true, after: 10 });
    write(lesson.overview, { after: 14 });
    write('Objectives', { size: 11, bold: true, after: 5 });
    for (const objective of lesson.objectives) write(`- ${objective}`, { indent: 10, after: 4 });
    y += 5;
    for (const section of lesson.sections) {
      write(section.heading, { size: 11, bold: true, after: 5 });
      write(section.body, { after: 12 });
    }
    write(`Practice: ${lesson.practice.title}`, { size: 11, bold: true, after: 5 });
    for (const [stepIndex, step] of lesson.practice.steps.entries()) write(`${stepIndex + 1}. ${step}`, { indent: 10, after: 4 });
    write(`Deliverable: ${lesson.practice.deliverable}`, { bold: true, after: 14 });
    write('Knowledge check', { size: 11, bold: true, after: 5 });
    write(lesson.knowledgeCheck.prompt, { bold: true, after: 6 });
    for (const [optionIndex, option] of lesson.knowledgeCheck.options.entries()) write(`${String.fromCharCode(65 + optionIndex)}. ${option}`, { indent: 10, after: 4 });
    const answer = lesson.knowledgeCheck.options[lesson.knowledgeCheck.correctOption];
    write(`Answer: ${answer}. ${lesson.knowledgeCheck.explanation}`, { after: 18 });
    const references = officialReferencesById(lesson.referenceIds);
    if (references.length > 0) {
      write('Official government references', { size: 11, bold: true, after: 5 });
      for (const reference of references) {
        write(`${reference.title} | ${reference.authority}`, { bold: true, after: 3 });
        write(reference.url, { size: 8, indent: 10, after: 6 });
      }
      write('Sources reviewed 20 September 2026. Verify the current government page and effective law before relying on a workflow.', { size: 8, after: 18 });
    }
  }
  savePdf(doc, `${safeFilename(course.title)}-guide.pdf`);
}

export async function downloadCompletionPreview(course: Course, learnerName: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setLineWidth(1);
  doc.rect(36, 36, 770, 523);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PATTADAR UNIVERSITY · PREVIEW', 421, 105, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(34);
  doc.text('Learning completion preview', 421, 190, { align: 'center' });
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
  doc.text('Prototype only. Production credentials require assessment, reviewer approval, and a verification ID.', 421, 478, { align: 'center' });
  savePdf(doc, `${safeFilename(course.title)}-completion-preview.pdf`);
}
