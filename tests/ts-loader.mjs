import { readFile } from 'node:fs/promises';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export async function resolve(specifier, context, defaultResolve) {
  const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
  const hasKnownExtension = /\.[a-z]+$/i.test(specifier);

  if (isRelative && !hasKnownExtension && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const candidates = [
      path.join(parentDir, `${specifier}.ts`),
      path.join(parentDir, `${specifier}.tsx`),
      path.join(parentDir, specifier, 'index.ts')
    ];

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return {
          url: pathToFileURL(candidate).href,
          shortCircuit: true
        };
      } catch {
        // Continue trying candidates.
      }
    }
  }

  return defaultResolve(specifier, context, defaultResolve);
}

export async function load(url, context, defaultLoad) {
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const source = await readFile(new URL(url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      fileName: new URL(url).pathname,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    });

    return {
      format: 'module',
      shortCircuit: true,
      source: outputText
    };
  }

  return defaultLoad(url, context, defaultLoad);
}
