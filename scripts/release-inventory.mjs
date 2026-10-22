// Release inventories are produced from the exact published directory.
// Validate both directions: absent assets and undeclared assets are errors.
export function validateReleaseInventory(release, expected, actual) {
  const errors=[];
  if (!release || release.schemaVersion!==2) errors.push('release schema must be v2');
  if (release?.slug!==expected.slug) errors.push('release slug differs from app config');
  if (release?.version!==expected.version) errors.push('release version differs from app config');
  if (release?.releasedAt!==expected.releaseDateTime) errors.push('release timestamp differs from app config');
  if (!Array.isArray(release?.files)) {
    errors.push('release file inventory is missing');
    return errors;
  }
  const named=release.files;
  const invalid=named.filter(file=>typeof file!=='string'||!file||file.startsWith('/')||file.split('/').includes('..')||file.split('/').includes('.'));
  if(invalid.length) errors.push('release inventory has unsafe paths: '+invalid.join(', '));
  if(new Set(named).size!==named.length) errors.push('release inventory contains duplicates');
  const expectedFiles=new Set(named);
  const actualFiles=new Set(actual);
  for(const file of actualFiles) if(!expectedFiles.has(file)) errors.push('published asset missing from release inventory: '+file);
  for(const file of expectedFiles) if(!actualFiles.has(file)) errors.push('listed release asset missing from published output: '+file);
  return errors;
}
