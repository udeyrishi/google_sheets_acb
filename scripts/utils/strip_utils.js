function stripForGas(content, startTag, endTag) {
  const lines = content.split(/\r?\n/);
  const output = [];
  let inStrip = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!inStrip && line.includes(startTag)) {
      const before = line.split(startTag)[0];
      if (before.trim().length > 0 || before.length > 0) {
        output.push(before);
      }
      inStrip = true;
      continue;
    }

    if (inStrip && line.includes(endTag)) {
      const after = line.split(endTag)[1] ?? "";
      if (after.trim().length > 0 || after.length > 0) {
        output.push(after);
      }
      inStrip = false;
      continue;
    }

    if (!inStrip) {
      output.push(line);
    }
  }

  if (inStrip) {
    throw new Error(`Missing ${endTag} before EOF`);
  }

  return output.join("\n").trim();
}

module.exports = {
  stripForGas,
};
