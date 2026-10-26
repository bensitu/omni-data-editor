import { releaseVersion } from './release-utils.mjs';

export function releaseNotes({ version: input, changelog, introduction }) {
  const version = releaseVersion(input);
  const source = changelog.replace(/\r\n/g, '\n');
  const headings = [
    ...source.matchAll(
      /^## \[([^\]\n]+)\](?: - (\d{4}-\d{2}-\d{2}))?[ \t]*$/gm,
    ),
  ];
  const matches = headings.filter((heading) => heading[1] === version);
  if (matches.length !== 1 || !matches[0][2])
    throw new Error(
      `Project changelog must contain one dated entry for ${version}.`,
    );
  const heading = matches[0];
  const next = headings[headings.indexOf(heading) + 1];
  const section = source.slice(heading.index + heading[0].length, next?.index);
  const references = [...source.matchAll(/^\[[^\]\n]+\]:[^\n]+$/gm)]
    .map((match) => match[0])
    .join('\n');
  const body = section.replace(/^\[[^\]\n]+\]:[^\n]+$/gm, '').trim();
  if (!body)
    throw new Error(`Project changelog has no release notes for ${version}.`);
  if (version === '0.1.0') {
    if (!introduction?.trim())
      throw new Error('The first release requires introductory release notes.');
    return `${introduction.trim()}\n`;
  }
  return `# v${version}\n\n${body}\n${references ? `\n${references}\n` : ''}`;
}
