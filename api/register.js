import bcrypt from 'bcryptjs';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO  = process.env.GITHUB_REPO;      // username/repo
const BASE_PATH    = 'database/user';

export default async function handler(req, res) {
  // 1. Cuma terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Hanya menerima POST' });
  }

  // 2. Ambil data
  const { role } = req.query;                      // dari /api/register/<role>
  const body = await req.json().catch(() => ({})); // jaga-jaga body kosong
  const { username, password } = body;

  // 3. Validasi sederhana
  const allow = ['resellerpanel','adminpanel','pantherpanel','owner'];
  if (!allow.includes(role) || !username?.trim() || !password) {
    return res.status(400).json({ error: 'Role, username dan password wajib diisi' });
  }

  const filePath = `${BASE_PATH}/${role}.json`;

  try {
    const apiURL = `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(filePath)}`;
    const headers = {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'vercel-simple'
    };

    // 4. Baca file lama (kalau ada)
    let users = [];
    let sha   = null;
    const getRes = await fetch(apiURL, { headers });
    if (getRes.status === 200) {
      const file = await getRes.json();
      sha   = file.sha;
      users = JSON.parse(Buffer.from(file.content, 'base64').toString('utf-8'));
    } else if (getRes.status !== 404) throw new Error('Gagal baca GitHub');

    // 5. Cek duplikat
    if (users.some(u => u.username === username.trim())) {
      return res.status(409).json({ error: 'Username sudah terdaftar' });
    }

    // 6. Hash & tambahkan
    const hashed = await bcrypt.hash(password, 10);
    users.push({
      username: username.trim(),
      password: hashed,
      created_at: new Date().toISOString()
    });

    // 7. Push ke GitHub
    const putBody = {
      message: `Tambah user ${username} di ${role}`,
      content: Buffer.from(JSON.stringify(users, null, 2)).toString('base64'),
      sha
    };
    const putRes = await fetch(apiURL, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });
    if (!putRes.ok) throw new Error('Gagal simpan ke GitHub');

    return res.status(200).json({ message: 'Akun berhasil dibuat!' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
 }
