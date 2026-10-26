import fs from 'node:fs/promises';
import path from 'node:path';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';

const finalPath = '/home/skai/Bureau/labo-dev/serious-app/exports/GENO-Proposition-partenariat-amelioree.pptx';
const previewDir = '/home/skai/Bureau/labo-dev/serious-app/.presentation-build/final-previews';
await fs.mkdir(previewDir, { recursive: true });
const presentation = await PresentationFile.importPptx(await FileBlob.load(finalPath));
if (presentation.slides.items.length !== 9) throw new Error(`Unexpected slide count: ${presentation.slides.items.length}`);
for (const [index, slide] of presentation.slides.items.entries()) {
  const name = `slide-${String(index + 1).padStart(2, '0')}.png`;
  const blob = await presentation.export({ slide, format: 'png', scale: 1.25 });
  await fs.writeFile(path.join(previewDir, name), new Uint8Array(await blob.arrayBuffer()));
}
const montage = await presentation.export({ format: 'webp', montage: true, scale: 0.45 });
await fs.writeFile(path.join(previewDir, 'montage.webp'), new Uint8Array(await montage.arrayBuffer()));
console.log(JSON.stringify({ finalPath, slides: presentation.slides.items.length, previewDir }));
