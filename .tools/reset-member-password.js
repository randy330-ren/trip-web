// 用法：node reset-member-password.js <成員名稱> <新密碼>
const a = require('firebase-admin/app'), t = require('firebase-admin/auth');
const admin = { initializeApp: a.initializeApp, auth: () => t.getAuth() };
const [name, pw] = process.argv.slice(2);
if (!name || !pw || pw.length < 6) { console.error('用法：node reset-member-password.js <成員名稱> <新密碼(至少6碼)>'); process.exit(1); }
admin.initializeApp({ projectId: 'jp-tottori' });
const email = `${encodeURIComponent(name)}@member.local`;
admin.auth().getUserByEmail(email)
    .then((u) => admin.auth().updateUser(u.uid, { password: pw }).then(() => console.log(`OK：${name}（uid ${u.uid}）密碼已重設`)))
    .catch((e) => { console.error('失敗：', e.code || e.message); process.exit(1); });
