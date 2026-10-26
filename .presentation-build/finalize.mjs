import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const workspaceDir = '/home/skai/Bureau/labo-dev/serious-app';
const skillDir = '/home/skai/.codex/plugins/cache/openai-primary-runtime/presentations/26.1020.11127/skills/presentations';
const runtimeDir = '/home/skai/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const candidatePath = path.join(workspaceDir, '.presentation-build/candidate.pptx');
const finalPath = path.join(workspaceDir, 'exports/GENO-Proposition-partenariat-amelioree.pptx');
const stagingDir = path.join(workspaceDir, '.presentation-build/finalizer');
await fs.mkdir(stagingDir, { recursive: true });
await fs.mkdir(path.dirname(finalPath), { recursive: true });

const { finalizePresentation } = await import(pathToFileURL(
  path.join(skillDir, 'container_tools/artifact_tool_utils.mjs'),
).href);

const result = await finalizePresentation({
  workspaceDir,
  candidatePath,
  finalPath,
  pythonExecutable: path.join(runtimeDir, 'python/bin/python3'),
  integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs: ['--expected-slide-size-emu', '12191695,6858000', '--validate-bullet-geometry', '--validate-heading-fit'],
  explicitTotalSlideCount: 9,
  requiredNativeTableOwnerSlides: [],
  requiredNativeChartOwnerSlides: [],
  fontPolicy: {
    basis: 'reference',
    families: ['Archivo Black', 'Familjen Grotesk', 'Familjen Grotesk Bold', 'Familjen Grotesk SemiBold'],
    referencePath: '/home/skai/Téléchargements/GENO-Proposition-de-partenariat-strategique.pptx',
    referenceSha256: 'e5790838e79c3d844f25fa8345bf661cd12a739f0ab5dfeb5375d1a9c60438ff',
  },
  verifyArtifactToolImport: true,
  receiptPath: path.join(stagingDir, 'GENO-Proposition-partenariat-amelioree.validation.json'),
});
console.log(JSON.stringify(result, null, 2));
