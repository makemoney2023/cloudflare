import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Workflow, WorkflowExecution } from '../types';

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 56;

const NAVY = rgb(0.12, 0.16, 0.23);
const SLATE = rgb(0.2, 0.25, 0.32);
const MUTED = rgb(0.42, 0.47, 0.55);
const LIGHT_LINE = rgb(0.85, 0.87, 0.9);
const ACCENT = rgb(0.23, 0.51, 0.96);

interface Ctx {
  doc: PDFDocument;
  body: PDFFont;
  bold: PDFFont;
  page: PDFPage;
  y: number;
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN) {
    newPage(ctx);
  }
}

function wrapParagraph(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        // Break overly long words character by character.
        let chunk = '';
        for (const ch of word) {
          const next = chunk + ch;
          if (font.widthOfTextAtSize(next, size) <= maxWidth) {
            chunk = next;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        line = chunk;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawTextBlock(
  ctx: Ctx,
  text: string,
  opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {},
) {
  const font = opts.font ?? ctx.body;
  const size = opts.size ?? 10.5;
  const color = opts.color ?? SLATE;
  const lineHeight = size * 1.45;
  const maxWidth = PAGE_W - MARGIN * 2;
  for (const line of wrapParagraph(text, font, size, maxWidth)) {
    ensureSpace(ctx, lineHeight);
    if (line) {
      ctx.page.drawText(line, { x: MARGIN, y: ctx.y - size, size, font, color });
    }
    ctx.y -= lineHeight;
  }
  ctx.y -= opts.gap ?? 6;
}

function drawRule(ctx: Ctx) {
  ensureSpace(ctx, 14);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.75,
    color: LIGHT_LINE,
  });
  ctx.y -= 14;
}

function formatDuration(ms?: number): string {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export async function generateReportPdf(
  execution: WorkflowExecution,
  workflow: Workflow,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, body, bold, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN };

  // ---- Cover band ----
  ctx.page.drawRectangle({
    x: 0,
    y: PAGE_H - 170,
    width: PAGE_W,
    height: 170,
    color: NAVY,
  });
  ctx.page.drawText('AGENT SWARM ORCHESTRATOR', {
    x: MARGIN,
    y: PAGE_H - 70,
    size: 11,
    font: bold,
    color: rgb(0.55, 0.65, 0.8),
  });
  for (const line of wrapParagraph(workflow.name || 'Untitled Swarm', bold, 30, PAGE_W - MARGIN * 2)) {
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y - 130, size: 30, font: bold, color: rgb(1, 1, 1) });
    ctx.y -= 36;
  }
  ctx.y = PAGE_H - 170 - 28;

  drawTextBlock(ctx, `Final report · generated ${formatDate(Date.now())}`, {
    size: 10,
    color: MUTED,
  });

  drawTextBlock(ctx, 'Swarm input', { font: bold, size: 12, color: NAVY, gap: 2 });
  drawTextBlock(ctx, execution.input || '(no input provided)', { size: 10.5 });

  drawRule(ctx);

  // ---- Run summary ----
  const results = Object.values(execution.results);
  const done = results.filter((r) => r.status === 'done').length;
  const errored = results.filter((r) => r.status === 'error').length;
  const totalMs = (execution.finishedAt ?? Date.now()) - execution.startedAt;

  drawTextBlock(ctx, 'Run summary', { font: bold, size: 12, color: NAVY, gap: 2 });
  drawTextBlock(ctx, `Status: ${execution.status.toUpperCase()}`, { size: 10.5 });
  drawTextBlock(ctx, `Agents: ${workflow.nodes.length}  ·  Completed: ${done}  ·  Errors: ${errored}`, {
    size: 10.5,
  });
  drawTextBlock(ctx, `Total run time: ${formatDuration(totalMs)}`, { size: 10.5 });

  drawRule(ctx);

  // ---- Per-agent sections (pipeline order) ----
  workflow.nodes.forEach((node, idx) => {
    const result = execution.results[node.id];
    ensureSpace(ctx, 90);
    drawTextBlock(ctx, `${idx + 1}. ${node.name}`, { font: bold, size: 14, color: NAVY, gap: 0 });
    const status = result ? result.status.toUpperCase() : 'NOT RUN';
    const duration =
      result?.startedAt != null && result?.finishedAt != null
        ? formatDuration(result.finishedAt - result.startedAt)
        : '—';
    drawTextBlock(ctx, `${node.type}  ·  ${status}  ·  ${duration}`, {
      size: 9.5,
      color: result?.status === 'error' ? rgb(0.8, 0.2, 0.2) : ACCENT,
      gap: 4,
    });
    if (result?.status === 'error') {
      drawTextBlock(ctx, result.error || 'Unknown error', { size: 10.5 });
    } else if (result?.output) {
      drawTextBlock(ctx, result.output, { size: 10.5 });
    } else {
      drawTextBlock(ctx, '(no output)', { size: 10.5, color: MUTED });
    }
    if (idx < workflow.nodes.length - 1) drawRule(ctx);
  });

  // ---- Footers ----
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawText(`Agent Swarm Orchestrator · ${formatDate(execution.startedAt)}`, {
      x: MARGIN,
      y: 32,
      size: 8,
      font: body,
      color: MUTED,
    });
    const label = `Page ${i + 1} of ${pages.length}`;
    page.drawText(label, {
      x: PAGE_W - MARGIN - body.widthOfTextAtSize(label, 8),
      y: 32,
      size: 8,
      font: body,
      color: MUTED,
    });
  });

  doc.setTitle(`${workflow.name} — Agent Swarm Report`);
  doc.setProducer('Agent Swarm Orchestrator');
  doc.setCreationDate(new Date());
  return doc.save();
}
