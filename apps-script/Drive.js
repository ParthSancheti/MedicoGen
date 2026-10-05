/**
 * Medico Gen — Google Drive storage for payment screenshots.
 * Files stay private to the script owner; the admin console receives them as data URLs.
 */

function proofFolder_() {
  var id = secret_('DRIVE_FOLDER_ID', true);
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder('Medico Gen — payment proofs');
  PropertiesService.getScriptProperties().setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function saveProof_(requestId, mime, base64) {
  var bytes;
  try { bytes = Utilities.base64Decode(String(base64)); } catch (e) { fail_('VALIDATION', 'The screenshot could not be read.'); }
  var ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  var blob = Utilities.newBlob(bytes, mime, requestId + '.' + ext);
  return proofFolder_().createFile(blob).getId();
}

function proofDataUrl_(fileId) {
  if (!fileId) return null;
  var blob = DriveApp.getFileById(fileId).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}
