const publicDocuments = new Set([
  "README.md",
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "assets/NOTICE.md",
  ".github/pull_request_template.md",
]);

export function isUnapprovedDocument(path) {
  return /\.(?:md|mdx|markdown)$/i.test(path) && !publicDocuments.has(path);
}
