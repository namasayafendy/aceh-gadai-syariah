const ts = require('typescript');
const fs = require('fs');
const files = process.argv.slice(2);
let hadError = false;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const errs = (sf.parseDiagnostics || []).concat(sf.syntacticDiagnostics || []);
  if (errs.length === 0) {
    console.log('OK  ' + f);
  } else {
    hadError = true;
    console.log('ERR ' + f);
    errs.slice(0, 3).forEach(d => {
      const pos = sf.getLineAndCharacterOfPosition(d.start || 0);
      console.log('    L' + (pos.line+1) + ': ' + (typeof d.messageText === 'string' ? d.messageText : d.messageText.messageText));
    });
  }
}
process.exit(hadError ? 1 : 0);
