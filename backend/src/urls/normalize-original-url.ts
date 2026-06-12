export const normalizeOriginalUrl = (originalUrl: string): string => {
  const parsed = new URL(originalUrl);
  const authorityStart = originalUrl.indexOf("//") + 2;
  const suffixStart = originalUrl.slice(authorityStart).search(/[/?#]/);
  const suffix = suffixStart === -1
    ? ""
    : originalUrl.slice(authorityStart + suffixStart);
  const authority = suffixStart === -1
    ? originalUrl.slice(authorityStart)
    : originalUrl.slice(authorityStart, authorityStart + suffixStart);
  const credentialsEnd = authority.lastIndexOf("@");
  const credentials = credentialsEnd === -1
    ? ""
    : authority.slice(0, credentialsEnd + 1);
  const port = parsed.port ? `:${parsed.port}` : "";

  return `${parsed.protocol}//${credentials}${parsed.hostname}${port}${suffix}`;
};
