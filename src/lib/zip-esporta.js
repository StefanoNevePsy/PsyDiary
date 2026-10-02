// Lo zip dell'esportazione, composto sul dispositivo. Con una password è
// cifrato AES-256 (lo standard degli zip "WinZip AES"): si apre con 7-Zip,
// Keka, WinRAR, The Unarchiver; non con "Estrai tutto" di Windows.
import { ZipWriter, BlobWriter, BlobReader, TextReader, configure } from '@zip.js/zip.js';

// niente worker: la Content Security Policy dell'app non li serve da blob
configure({ useWebWorkers: false });

export async function creaZip(voci, { password = '', avanza = () => {} } = {}) {
  const opz = password ? { password, encryptionStrength: 3, zipCrypto: false } : {};
  const zip = new ZipWriter(new BlobWriter('application/zip'), opz);
  let i = 0;
  for (const v of voci) {
    avanza(i++, voci.length);
    const lettore = v.blob ? new BlobReader(v.blob) : new TextReader(v.testo);
    // le immagini sono già compresse: si mettono così come sono
    const giaCompresso = v.blob && /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/.test(v.blob.type || '');
    await zip.add('PsyDiary/' + v.percorso, lettore, giaCompresso ? { level: 0 } : {});
  }
  return zip.close();
}
