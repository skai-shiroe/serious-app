import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const workspaceDir = '/home/skai/Bureau/labo-dev/serious-app';
const sourcePath = '/home/skai/Téléchargements/GENO-Proposition-de-partenariat-strategique.pptx';
const generatedPhotoPath = '/home/skai/.codex/generated_images/01a14bac-ae2a-70f1-92f9-702f5296d37b/exec-d5f9b9bc-7187-4fe6-995a-828d9a1e6f42.png';
const logoPath = path.join(workspaceDir, 'assets/images/geno/web/icon-512.png');
const buildDir = path.join(workspaceDir, '.presentation-build');
const previewDir = path.join(buildDir, 'previews');
const candidatePath = path.join(buildDir, 'candidate.pptx');
const logoBytes = new Uint8Array(await fs.readFile(logoPath));
const generatedPhotoBytes = new Uint8Array(await fs.readFile(generatedPhotoPath));

const COLORS = {
  ink: '#111827',
  rose: '#F43F5E',
  rose2: '#EC4899',
  pale: '#FFF7F8',
  pale2: '#FFF1F4',
  pale3: '#FFE1E8',
  white: '#FFFFFF',
  muted: '#6B7280',
  darkRule: '#65364A',
  lightRule: '#F4C7D1',
};

await fs.mkdir(previewDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePath));
if (presentation.slides.items.length !== 9) {
  throw new Error(`Expected 9 slides, found ${presentation.slides.items.length}`);
}

// Brand the inherited layouts and remove the Gamma mark supplied by the source template.
const layoutBackgrounds = new Map([
  ['Slide master 1', COLORS.ink],
  ['Slide master 2', COLORS.ink],
  ['Slide master 3', COLORS.pale],
  ['Slide master 4', COLORS.pale],
]);
for (const layout of presentation.layouts.items) {
  const color = layoutBackgrounds.get(layout.name);
  if (color) layout.background.fill = color;
  for (const image of [...(layout.images?.items ?? [])]) {
    const position = image.position ?? image.frame;
    if (position && position.left > 1000 && position.top > 650) {
      layout.images.deleteById(image.id);
    }
  }
}

const coverLayout = presentation.layouts.items.find((layout) => layout.name === 'Slide master 1');
const coverOverlay = coverLayout?.shapes.items.find((shape) => shape.name === 'Shape 0');
if (coverOverlay) coverOverlay.fill = 'rgba(17, 24, 39, 0.48)';

const slideBackgrounds = [
  COLORS.ink,
  COLORS.ink,
  COLORS.pale,
  COLORS.pale,
  COLORS.pale,
  COLORS.ink,
  COLORS.pale,
  COLORS.pale,
  COLORS.ink,
];
for (const [index, slide] of presentation.slides.items.entries()) {
  slide.background.fill = slideBackgrounds[index];
}

const snapshot = await presentation.inspect({
  kind: 'slide,textbox,shape,image,table,chart,notes,layout',
  maxChars: 300000,
});
const records = snapshot.ndjson.split('\n').filter(Boolean).map((line) => JSON.parse(line));
const darkSlides = new Set([0, 1, 5, 8]);
for (const record of records) {
  if (record.kind === 'textbox' && typeof record.slideIndex === 'number') {
    const shape = presentation.resolve(record.id);
    if (darkSlides.has(record.slideIndex)) {
      shape.text.color = COLORS.white;
    } else if (record.slideIndex === 6) {
      shape.text.color = record.text?.startsWith('LES ENGAGEMENTS') ? COLORS.muted : COLORS.ink;
    } else if (record.style?.color?.toUpperCase() === '#F5892A') {
      shape.text.color = COLORS.rose;
    }
  }
  if (record.kind === 'shape' && typeof record.slideIndex === 'number') {
    const fill = record.fillColor?.toUpperCase();
    const shape = presentation.resolve(record.id);
    if (fill === '#F5892A' || fill === '#492403') shape.fill = COLORS.rose;
    else if (fill === '#F4EFE1') shape.fill = COLORS.pale2;
    else if (fill === '#FDE4CE') shape.fill = COLORS.pale3;
    else if (fill === '#03343B') {
      shape.fill = record.slideIndex === 8 ? COLORS.darkRule : COLORS.lightRule;
    }
  }
}

// Replace the old “logo to add” placeholder with the actual app mark.
presentation.delete(['sh/k3yl0zql', 'sh/65g3298r', 'sh/ts7md4r2']);
presentation.slides.items[0].images.add({
  blob: logoBytes,
  contentType: 'image/png',
  alt: 'Logo officiel de Géno',
  fit: 'contain',
  position: { left: 77.33, top: 122, width: 92, height: 92 },
});

// Widen the closing accent band so the complete call to action sits on it.
presentation.resolve('sh/mdonql4z').position = {
  left: 58.67,
  top: 422.11,
  width: 370,
  height: 33.26,
};

// The source repeated one photo on slides 2 and 6; use a new editorial image on slide 6.
const caseStudyImage = presentation.resolve('im/vmp43mlo');
const previousFrame = caseStudyImage.frame;
const previousCrop = caseStudyImage.crop;
const previousGeometry = caseStudyImage.geometry;
caseStudyImage.replace({
  blob: generatedPhotoBytes,
  contentType: 'image/png',
  alt: 'Échange entre une professionnelle de santé et un couple, illustration éditoriale générée pour Géno',
  prompt: 'Editorial image generated for a fictional partnership example in this proposal.',
  fit: 'cover',
});
caseStudyImage.frame = previousFrame;
caseStudyImage.crop = previousCrop;
caseStudyImage.geometry = previousGeometry;

// Keep the closing photo within the exact 16:9 slide canvas.
presentation.resolve('im/hcz65kbq').frame = {
  left: 767.98,
  top: 0,
  width: 511.99,
  height: 720,
};

// Remove the decorative strip from the source template; it contains the Gamma mark.
presentation.delete('im/4zm50365');

const after = await presentation.inspect({
  kind: 'slide,textbox,shape,image,table,chart,notes,layout',
  maxChars: 300000,
});
await fs.writeFile(path.join(buildDir, 'inspection.ndjson'), after.ndjson, 'utf8');
for (const [index, slide] of presentation.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, '0')}`;
  const png = await presentation.export({ slide, format: 'png', scale: 1.25 });
  await fs.writeFile(path.join(previewDir, `${stem}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: 'layout', detail: 'full' });
  await fs.writeFile(path.join(previewDir, `${stem}.json`), await layout.text());
}
const montage = await presentation.export({ format: 'webp', montage: true, scale: 0.45 });
await fs.writeFile(path.join(previewDir, 'montage.webp'), new Uint8Array(await montage.arrayBuffer()));
await (await PresentationFile.exportPptx(presentation)).save(candidatePath);
console.log(JSON.stringify({ candidatePath, slides: presentation.slides.items.length }));
