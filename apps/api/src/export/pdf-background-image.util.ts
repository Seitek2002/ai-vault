import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ServiceUnavailableException } from '@nestjs/common';
const run = promisify(execFile);

/** Private temporary raster used only for Word's repeating page background. */
export async function pdfBackgroundImage(buffer: Buffer, page: number) {
  const root = resolve(tmpdir()), directory = await mkdtemp(join(root, 'volt-letterhead-'));
  try {
    const source = join(directory, 'source.pdf'), target = join(directory, 'background');
    await writeFile(source, buffer, { mode: 0o600 });
    await run(process.env.PDFTOPPM_PATH ?? 'pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-scale-to', '2000', '-png', source, target], { timeout: 60000, maxBuffer: 1024 * 1024 });
    return await readFile(`${target}.png`);
  } catch { throw new ServiceUnavailableException('Не удалось подготовить фон DOCX. Попробуйте экспорт PDF или повторите позже.'); }
  finally {
    if (resolve(directory).startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) await rm(directory, { recursive: true, force: true });
  }
}
