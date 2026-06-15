const { google } = require('googleapis');

const CONFIG = {
  SHEET_ID:        '1W0fi_PSUvrHhCgpuA6V412XIAUSaUS2juCgbn4ryy3k',
  DRIVE_FOLDER_ID: '1776WDH8ReEsnxBDMV_cC2FyowpabHDqr',
  SHEET_NAME:      'Sheet1',
};

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ]
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;
    const auth = getAuth();
    await auth.authorize();

    // 1. Upload gambar ke Google Drive
    let imageUrl = '-';
    if (data.imageBase64) {
      const drive    = google.drive({ version: 'v3', auth });
      const buffer   = Buffer.from(data.imageBase64, 'base64');
      const fileName = data.fileName || `hazard_${Date.now()}.jpg`;

      const { Readable } = require('stream');
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      const driveRes = await drive.files.create({
        requestBody: {
          name:    fileName,
          parents: [CONFIG.DRIVE_FOLDER_ID]
        },
        media: {
          mimeType: data.mimeType || 'image/jpeg',
          body:     stream
        },
        fields: 'id, webViewLink'
      });

      await drive.permissions.create({
        fileId:      driveRes.data.id,
        requestBody: { role: 'reader', type: 'anyone' }
      });

      imageUrl = driveRes.data.webViewLink;
    }

    // 2. Simpan ke Google Sheets
    const sheets  = google.sheets({ version: 'v4', auth });
    const now     = new Date();
    const dateStr = now.toLocaleDateString('ms-MY');
    const timeStr = now.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });

    await sheets.spreadsheets.values.append({
      spreadsheetId:    CONFIG.SHEET_ID,
      range:            `${CONFIG.SHEET_NAME}!A:S`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          '',
          dateStr,
          timeStr,
          data.reporterName || '-',
          data.department   || '-',
          data.location     || '-',
          data.activity     || '-',
          data.hazardDesc   || '-',
          '-', '-', '-', '-', '-',
          'PENDING',
          '-', '-', '-',
          'OPEN',
          imageUrl
        ]]
      }
    });

    return res.status(200).json({ success: true, imageUrl });

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
