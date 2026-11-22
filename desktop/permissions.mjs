export function microphoneOnly(permission, requestingOrigin, details, appOrigin) {
  if (permission !== 'media' || requestingOrigin !== appOrigin) return false;
  if (details.mediaTypes) return details.mediaTypes.length === 1 && details.mediaTypes[0] === 'audio';
  return details.mediaType === 'audio';
}
