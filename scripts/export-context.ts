import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { countTokens } from 'gpt-tokenizer/encoding/o200k_base';
import { validateSnapshot } from '../src/features/shopkeeper/services/validation';
import { encodeContext, projectContext } from '../src/shared/context/export';

const MAX_INPUT_BYTES = 10 * 1024 * 1024;

function parseArgs(argv: string[]): { input: string; format: 'toon' | 'json'; output: string } {
  let input = '';
  let format = '';
  let output = '';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input' && i + 1 < argv.length) {
      input = argv[++i]!;
    } else if (arg === '--format' && i + 1 < argv.length) {
      format = argv[++i]!;
    } else if (arg === '--output' && i + 1 < argv.length) {
      output = argv[++i]!;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
    }
  }
  if (!input || !output || (format !== 'toon' && format !== 'json')) {
    throw new Error('Usage: --input <path> --format toon|json --output <path>');
  }
  return { input, format, output };
}

function main(): void {
  const { input, format, output } = parseArgs(process.argv.slice(2));
  const stat = statSync(input);
  if (stat.size > MAX_INPUT_BYTES) {
    throw new Error(`Input file exceeds 10 MiB limit (${stat.size} bytes).`);
  }
  const raw = readFileSync(input, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  validateSnapshot(parsed);

  const projected = projectContext(parsed);
  const jsonOutput = JSON.stringify(projected);
  const toonOutput = encodeContext(parsed);

  const jsonTokens = countTokens(jsonOutput);
  const toonTokens = countTokens(toonOutput);
  const deltaPercent = jsonTokens === 0 ? 0 : ((toonTokens - jsonTokens) / jsonTokens) * 100;

  process.stderr.write(
    `encoding=o200k_base json_tokens=${jsonTokens} toon_tokens=${toonTokens} delta_percent=${deltaPercent.toFixed(2)}%\n`,
  );

  writeFileSync(output, format === 'toon' ? toonOutput : jsonOutput, 'utf8');
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
