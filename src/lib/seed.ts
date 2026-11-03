import { asc, eq, sql } from "drizzle-orm";
import { hashPassword, type SessionUser } from "@/lib/auth";
import { db } from "@/db";
import {
  approvalSteps,
  approvalWorkflows,
  departments,
  letterApprovals,
  letterCategories,
  letterTemplates,
  letters,
  notifications,
  numberingSequences,
  permissions,
  templateFields,
  rolePermissions,
  roles,
  users,
} from "@/db/schema";
import { actOnLetter, submitLetter } from "@/lib/workflow";
import { renderTemplateText } from "@/lib/documents";
import { PERMISSIONS, ROLE, ROLE_LEVEL, ROLE_LABEL, ROLE_PERMISSIONS } from "@/lib/status";
import { TEMPLATE_PRESETS } from "@/lib/template-presets";

const DEMO_PASSWORD = "surat123";

const DEPARTMENTS = [
  { code: "SEK", name: "Sekretariat Utama", headName: "Siti Rahmawati, S.E.", address: "Gedung A Lt. 1" },
  { code: "AKD", name: "Bagian Akademik", headName: "Dr. Budi Santoso, M.Pd.", address: "Gedung B Lt. 2" },
  { code: "KEU", name: "Bagian Keuangan", headName: "Rina Wijaya, S.Ak.", address: "Gedung A Lt. 3" },
  { code: "SDM", name: "Bagian SDM & Umum", headName: "Hendra Kusuma, S.H.", address: "Gedung C Lt. 1" },
];

const USER_SEEDS = [
  { email: "superadmin@esurat.local", name: "Andi Pratama", role: ROLE.SUPER_ADMIN, dept: "SEK", position: "Administrator Sistem", nip: "198501102010011001" },
  { email: "admin@esurat.local", name: "Siti Rahmawati, S.E.", role: ROLE.ADMIN, dept: "SEK", position: "Kepala Bagian Persuratan", nip: "198302142009032002" },
  { email: "pembuat@esurat.local", name: "Budi Santoso, S.Pd.", role: ROLE.USER, dept: "AKD", position: "Staf Administrasi Akademik", nip: "199004152015031003" },
  { email: "pembuat2@esurat.local", name: "Rina Wijaya, S.Ak.", role: ROLE.USER, dept: "KEU", position: "Staf Keuangan", nip: "199206202016042004" },
  { email: "pemeriksa@esurat.local", name: "Dewi Lestari, M.M.", role: ROLE.REVIEWER, dept: "SEK", position: "Pemeriksa Dokumen Persuratan", nip: "198711052011012005" },
  { email: "pejabat@esurat.local", name: "Dr. Ahmad Fauzi, M.Pd.", role: ROLE.APPROVER, dept: "SEK", position: "Kepala Biro / Pimpinan Instansi", nip: "197203081998031006" },
];

const CATEGORIES = [
  { code: "SD", name: "Surat Dinas", direction: "keluar", description: "Surat kedinasan umum keluar instansi", format: "{nomor}/{kode}/{org}/{bulan}/{tahun}" },
  { code: "UD", name: "Surat Undangan", direction: "keluar", description: "Undangan rapat, workshop, dan kegiatan", format: "{nomor}/{kode}/{org}/{bulan}/{tahun}" },
  { code: "SK", name: "Surat Keterangan", direction: "internal", description: "Keterangan pegawai, penghasilan, dan keaktifan", format: "{nomor}/{kode}/{org}/{bulan}/{tahun}" },
  { code: "ST", name: "Surat Tugas", direction: "keluar", description: "Penugasan pegawai dan tim kerja", format: "{nomor}/{kode}/{org}/{bulan}/{tahun}" },
  { code: "SM", name: "Surat Masuk", direction: "masuk", description: "Pencatatan dan disposisi surat masuk", format: "{nomor}/{kode}/{org}/{bulan}/{tahun}" },
];

const WORKFLOWS = [
  {
    code: "WF-STD",
    name: "Alur Standar Persuratan",
    category: null,
    isDefault: true,
    steps: [
      { label: "Pemeriksaan Kelengkapan", roleCode: ROLE.ADMIN, slaHours: 24 },
      { label: "Review Substansi", roleCode: ROLE.REVIEWER, slaHours: 24 },
      { label: "Persetujuan Pimpinan", roleCode: ROLE.APPROVER, slaHours: 48 },
    ],
  },
  {
    code: "WF-SK",
    name: "Alur Surat Keterangan",
    category: "SK",
    isDefault: false,
    steps: [
      { label: "Verifikasi Data Pegawai", roleCode: ROLE.ADMIN, slaHours: 12 },
      { label: "Persetujuan Kepala Biro", roleCode: ROLE.APPROVER, slaHours: 24 },
    ],
  },
  {
    code: "WF-ST",
    name: "Alur Surat Tugas",
    category: "ST",
    isDefault: false,
    steps: [
      { label: "Review Atasan Langsung", roleCode: ROLE.REVIEWER, slaHours: 12 },
      { label: "Persetujuan Pimpinan", roleCode: ROLE.APPROVER, slaHours: 24 },
    ],
  },
  {
    code: "WF-SM",
    name: "Alur Disposisi Surat Masuk",
    category: "SM",
    isDefault: false,
    steps: [
      { label: "Pencatatan Agenda", roleCode: ROLE.ADMIN, slaHours: 8 },
      { label: "Disposisi Pimpinan", roleCode: ROLE.APPROVER, slaHours: 24 },
    ],
  },
];

function monthsAgo(months: number, day = 5, hour = 9) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() - months, day, hour, 0, 0);
  return date;
}

export async function seedDatabase(): Promise<{ skipped: boolean; summary: string }> {
  const existing = await db.select({ total: sql<number>`count(*)::int` }).from(users);
  if ((existing[0]?.total ?? 0) > 0) {
    return { skipped: true, summary: "database sudah berisi data" };
  }

  /* ------------------------------ roles ------------------------------ */
  const roleRows: Record<string, number> = {};
  for (const [code, name] of Object.entries(ROLE_LABEL)) {
    const [row] = await db
      .insert(roles)
      .values({ code, name, description: `Hak akses ${name}`, level: ROLE_LEVEL[code] ?? 1 })
      .returning();
    roleRows[code] = row.id;
  }

  /* --------------------------- permissions --------------------------- */
  const permissionRows: Record<string, number> = {};
  for (const permission of PERMISSIONS) {
    const [row] = await db
      .insert(permissions)
      .values({ code: permission.code, name: permission.name, module: permission.module })
      .returning();
    permissionRows[permission.code] = row.id;
  }
  const rpValues: { roleId: number; permissionId: number }[] = [];
  for (const [roleCode, codes] of Object.entries(ROLE_PERMISSIONS)) {
    for (const code of codes) {
      if (permissionRows[code] && roleRows[roleCode]) {
        rpValues.push({ roleId: roleRows[roleCode], permissionId: permissionRows[code] });
      }
    }
  }
  if (rpValues.length) await db.insert(rolePermissions).values(rpValues);

  /* --------------------------- departments --------------------------- */
  const deptRows: Record<string, number> = {};
  for (const dept of DEPARTMENTS) {
    const [row] = await db.insert(departments).values({ ...dept, isActive: true }).returning();
    deptRows[dept.code] = row.id;
  }

  /* ------------------------------- users ----------------------------- */
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const userRows: Record<string, { id: number; name: string; roleCode: string; departmentId: number | null; position: string | null; nip: string | null }> = {};
  for (const seed of USER_SEEDS) {
    const [row] = await db
      .insert(users)
      .values({
        name: seed.name,
        email: seed.email,
        passwordHash,
        roleId: roleRows[seed.role],
        departmentId: deptRows[seed.dept] ?? null,
        position: seed.position,
        nip: seed.nip,
        isActive: true,
      })
      .returning();
    userRows[seed.role === ROLE.USER ? seed.email : seed.role] = {
      id: row.id,
      name: row.name,
      roleCode: seed.role,
      departmentId: row.departmentId,
      position: row.position,
      nip: row.nip,
    };
  }

  const asSession = (key: string): SessionUser => {
    const found = userRows[key];
    return {
      id: found.id,
      name: found.name,
      email: `${key}@esurat.local`,
      roleCode: found.roleCode,
      roleName: ROLE_LABEL[found.roleCode],
      roleLevel: ROLE_LEVEL[found.roleCode],
      departmentId: found.departmentId,
      departmentName: null,
      position: found.position,
      nip: found.nip,
      signatureText: found.name,
      isActive: true,
      permissions: ROLE_PERMISSIONS[found.roleCode] ?? [],
    };
  };

  const actors = {
    admin: asSession(ROLE.ADMIN),
    reviewer: asSession(ROLE.REVIEWER),
    approver: asSession(ROLE.APPROVER),
    user1: asSession("pembuat@esurat.local"),
    user2: asSession("pembuat2@esurat.local"),
    superadmin: asSession(ROLE.SUPER_ADMIN),
  };

  /* ---------------------------- categories --------------------------- */
  const categoryRows: Record<string, number> = {};
  for (const category of CATEGORIES) {
    const [row] = await db
      .insert(letterCategories)
      .values({
        code: category.code,
        name: category.name,
        description: category.description,
        direction: category.direction,
        defaultNumberFormat: category.format,
        isActive: true,
      })
      .returning();
    categoryRows[category.code] = row.id;
  }

  /* ----------------------------- templates --------------------------- */
  const { extractPlaceholders } = await import("@/lib/documents");
  const templateRows: Record<string, { id: number; body: string }> = {};
  for (const template of TEMPLATE_PRESETS) {
    const [row] = await db
      .insert(letterTemplates)
      .values({
        code: template.code,
        name: template.name,
        categoryId: template.categoryCode ? categoryRows[template.categoryCode] ?? null : null,
        description: template.description,
        bodyTemplate: template.body,
        numberingFormat: template.numberingFormat || null,
        kopText: template.kopText,
        signerName: template.signerName,
        signerPosition: template.signerPosition,
        isActive: true,
        createdBy: userRows[ROLE.ADMIN].id,
      })
      .returning();
    templateRows[template.code] = { id: row.id, body: template.body };

    const keys = extractPlaceholders(template.body);
    const allKeys = Array.from(new Set([...keys, ...template.fields.map((field) => field.key)]));
    await db.insert(templateFields).values(
      allKeys.map((key, index) => {
        const presetField = template.fields.find((field) => field.key === key);
        return {
          templateId: row.id,
          key,
          label: presetField?.label || labelFor(key),
          type: presetField?.type || typeFor(key),
          isRequired: presetField ? Boolean(presetField.isRequired) : ["perihal", "nama_penerima", "isi_surat"].includes(key),
          sortOrder: index,
          source: (presetField ? "manual" : "detected") as "manual" | "detected",
          placeholder: presetField?.placeholder || `Isi ${presetField?.label || labelFor(key)}`,
          helpText: presetField?.helpText || null,
        };
      }),
    );
  }

  /* ----------------------------- workflows --------------------------- */
  for (const workflow of WORKFLOWS) {
    const [row] = await db
      .insert(approvalWorkflows)
      .values({
        code: workflow.code,
        name: workflow.name,
        description: `Alur persetujuan ${workflow.name.replace("Alur ", "")}`,
        categoryId: workflow.category ? categoryRows[workflow.category] : null,
        isDefault: workflow.isDefault,
        isActive: true,
        createdBy: userRows[ROLE.SUPER_ADMIN].id,
      })
      .returning();
    await db.insert(approvalSteps).values(
      workflow.steps.map((step, index) => ({
        workflowId: row.id,
        stepOrder: index + 1,
        label: step.label,
        roleCode: step.roleCode,
        slaHours: step.slaHours,
        description: `Tahap ${index + 1}: ${ROLE_LABEL[step.roleCode]}`,
        isRequired: true,
      })),
    );
  }

  /* ----------------------- numbering sequences ----------------------- */
  const year = new Date().getFullYear();
  await db.insert(numberingSequences).values(
    Object.entries(categoryRows).map(([code, categoryId]) => ({
      scopeKey: `cat:${categoryId}|dept:0|year:${year}`,
      categoryId,
      year,
      lastNumber: 0,
      format: "{nomor}/{kode}/{org}/{bulan}/{tahun}",
      letterCode: code,
      organizationCode: "ESRT",
    })),
  );

  /* ------------------------------ letters ---------------------------- */
  type Spec = {
    title: string;
    template: string;
    category: string;
    sender: SessionUser;
    recipient: string;
    recipientPosition: string;
    recipientAddress: string;
    monthsAgo: number;
    target: string;
    data: Record<string, string>;
    classification?: string;
    priority?: string;
  };

  const today = new Date().toISOString().slice(0, 10);
  const iso = (months: number) => monthsAgo(months, 6).toISOString().slice(0, 10);

  const SPECS: Spec[] = [
    {
      title: "Permohonan Peminjaman Aula Serbaguna untuk Ujian Kompetensi",
      template: "TPL-SD",
      category: "SD",
      sender: actors.user1,
      recipient: "Kepala Bagian Umum",
      recipientPosition: "Bagian SDM & Umum",
      recipientAddress: "Gedung C Lt. 1, Jl. Merdeka No. 21 Bandung",
      monthsAgo: 0,
      target: "draft",
      data: { unit_kerja: "Bagian Akademik", tahun_anggaran: String(year), isi_surat: "Kami mengajukan permohonan peminjaman Aula Serbaguna pada tanggal 20 bulan depan untuk pelaksanaan Ujian Kompetensi Pegawai dengan peserta sebanyak 120 orang.", nama_penerima: "Kepala Bagian Umum" },
    },
    {
      title: "Undangan Rapat Koordinasi Program Kerja Triwulan",
      template: "TPL-UD",
      category: "UD",
      sender: actors.user1,
      recipient: "Seluruh Kepala Bagian",
      recipientPosition: "Lingkungan Dinas",
      recipientAddress: "Bandung",
      monthsAgo: 0,
      target: "menunggu_pemeriksaan",
      data: { nama_kegiatan: "Rapat Koordinasi Program Kerja Triwulan", hari_tanggal: "Senin, 12 Januari", waktu: "09.00 WIB s.d. selesai", tempat: "Ruang Rapat Utama Gedung A", agenda: "Evaluasi capaian dan penyusunan rencana triwulan berikutnya", nama_penerima: "Seluruh Kepala Bagian" },
    },
    {
      title: "Permohonan Pengadaan Perangkat Komputer untuk Laboratorium",
      template: "TPL-SD",
      category: "SD",
      sender: actors.user2,
      recipient: "Kepala Bagian Keuangan",
      recipientPosition: "Bagian Keuangan",
      recipientAddress: "Gedung A Lt. 3",
      monthsAgo: 0,
      target: "dalam_pemeriksaan",
      priority: "tinggi",
      data: { unit_kerja: "Bagian Keuangan", tahun_anggaran: String(year), isi_surat: "Sehubungan dengan penambahan layanan digital, kami mengajukan pengadaan 15 unit komputer lengkap beserta lisensi perangkat lunak pendukung dengan estimasi anggaran sesuai standar harga yang berlaku.", nama_penerima: "Kepala Bagian Keuangan" },
    },
    {
      title: "Surat Keterangan Aktif Bekerja",
      template: "TPL-SK",
      category: "SK",
      sender: actors.user1,
      recipient: "Yang Berkepentingan",
      recipientPosition: "-",
      recipientAddress: "-",
      monthsAgo: 1,
      target: "revisi",
      data: { nama_ybs: "Rina Wijaya, S.Ak.", nomor_identitas: "199206202016042004", jabatan_ybs: "Staf Keuangan", unit_kerja: "Bagian Keuangan", isi_keterangan: "pegawai aktif pada instansi ini terhitung sejak 1 April 2016", keperluan: "pengajuan kredit pemilikan rumah", nama_penerima: "Yang Berkepentingan" },
    },
    {
      title: "Penugasan Monitoring Ujian Akhir Semester",
      template: "TPL-ST",
      category: "ST",
      sender: actors.user2,
      recipient: "Tim Monitoring",
      recipientPosition: "Satuan Tugas Akademik",
      recipientAddress: "Wilayah Kerja Dinas",
      monthsAgo: 1,
      target: "menunggu_persetujuan",
      data: { nama_petugas: "Budi Santoso, S.Pd.", jabatan_petugas: "Staf Administrasi Akademik", tujuan_tugas: "Melakukan monitoring pelaksanaan Ujian Akhir Semester", tempat_tugas: "Cabang Dinas Wilayah III", tanggal_pelaksanaan: "10 s.d. 14 bulan berjalan", nama_penerima: "Tim Monitoring" },
    },
    {
      title: "Permohonan Kerja Sama Program Magang Industri",
      template: "TPL-SD",
      category: "SD",
      sender: actors.user1,
      recipient: "Direktur PT Maju Teknologi Nusantara",
      recipientPosition: "Direksi",
      recipientAddress: "Jl. Soekarno-Hatta No. 456, Bandung",
      monthsAgo: 2,
      target: "disetujui",
      data: { unit_kerja: "Bagian Akademik", tahun_anggaran: String(year), isi_surat: "Kami bermaksud menjalin kerja sama program magang industri bagi 30 peserta didik untuk periode enam bulan, meliputi penempatan, pembimbingan, dan evaluasi bersama.", nama_penerima: "Direktur PT Maju Teknologi Nusantara" },
    },
    {
      title: "Undangan Workshop Kurikulum Digital",
      template: "TPL-UD",
      category: "UD",
      sender: actors.user2,
      recipient: "Kepala Satuan Pendidikan",
      recipientPosition: "SMA/SMK se-Wilayah III",
      recipientAddress: "Bandung",
      monthsAgo: 2,
      target: "selesai",
      data: { nama_kegiatan: "Workshop Implementasi Kurikulum Digital", hari_tanggal: "Rabu, 18 bulan lalu", waktu: "08.30 WIB s.d. 15.00 WIB", tempat: "Aula Serbaguna Gedung B", agenda: "Penyusunan perangkat ajar berbasis digital", nama_penerima: "Kepala Satuan Pendidikan" },
    },
    {
      title: "Surat Keterangan Penghasilan Pegawai",
      template: "TPL-SK",
      category: "SK",
      sender: actors.user1,
      recipient: "Bank Negara Indonesia",
      recipientPosition: "Kepala Cabang",
      recipientAddress: "Jl. Asia Afrika No. 55, Bandung",
      monthsAgo: 3,
      target: "diarsipkan",
      data: { nama_ybs: "Budi Santoso, S.Pd.", nomor_identitas: "199004152015031003", jabatan_ybs: "Staf Administrasi Akademik", unit_kerja: "Bagian Akademik", isi_keterangan: "pegawai tetap dengan penghasilan bulanan sesuai peraturan yang berlaku", keperluan: "persyaratan administrasi perbankan", nama_penerima: "Bank Negara Indonesia" },
    },
    {
      title: "Permohonan Penambahan Anggaran Perjalanan Dinas",
      template: "TPL-SD",
      category: "SD",
      sender: actors.user2,
      recipient: "Kepala Bagian Keuangan",
      recipientPosition: "Bagian Keuangan",
      recipientAddress: "Gedung A Lt. 3",
      monthsAgo: 3,
      target: "ditolak",
      data: { unit_kerja: "Bagian Keuangan", tahun_anggaran: String(year), isi_surat: "Mengajukan penambahan anggaran perjalanan dinas sebesar 25% dari pagu berjalan untuk mendukung kegiatan koordinasi lintas wilayah.", nama_penerima: "Kepala Bagian Keuangan" },
    },
    {
      title: "Disposisi Surat Masuk dari Kementerian Pendidikan",
      template: "TPL-SM",
      category: "SM",
      sender: actors.admin,
      recipient: "Kepala Bagian Akademik",
      recipientPosition: "Bagian Akademik",
      recipientAddress: "Gedung B Lt. 2",
      monthsAgo: 4,
      target: "diarsipkan",
      data: { asal_surat: "Kementerian Pendidikan dan Kebudayaan", nomor_surat_masuk: "1123/KPD/IX", tanggal_surat_masuk: iso(4), perihal_masuk: "Permintaan data capaian program digitalisasi", isi_disposisi: "Agar Bagian Akademik menyiapkan data dan menyampaikan laporan paling lambat tujuh hari kerja.", batas_waktu: "7 hari kerja", nama_penerima: "Kepala Bagian Akademik" },
    },
    {
      title: "Penugasan Pelatihan Sertifikasi Pengadaan Barang dan Jasa",
      template: "TPL-ST",
      category: "ST",
      sender: actors.user1,
      recipient: "Peserta Pelatihan",
      recipientPosition: "Staf Keuangan",
      recipientAddress: "Pusat Pelatihan Nasional, Jakarta",
      monthsAgo: 4,
      target: "selesai",
      data: { nama_petugas: "Rina Wijaya, S.Ak.", jabatan_petugas: "Staf Keuangan", tujuan_tugas: "Mengikuti Pelatihan Sertifikasi Pengadaan Barang/Jasa Tingkat Dasar", tempat_tugas: "Pusat Pelatihan Nasional, Jakarta", tanggal_pelaksanaan: "5 hari kerja", nama_penerima: "Peserta Pelatihan" },
    },
    {
      title: "Undangan Sosialisasi Penerapan Sistem E-SURAT",
      template: "TPL-UD",
      category: "UD",
      sender: actors.admin,
      recipient: "Seluruh Pegawai",
      recipientPosition: "Lingkungan Dinas",
      recipientAddress: "Bandung",
      monthsAgo: 5,
      target: "disetujui",
      data: { nama_kegiatan: "Sosialisasi Penerapan Sistem E-SURAT", hari_tanggal: "Kamis, 12 bulan lalu", waktu: "13.00 WIB s.d. selesai", tempat: "Aula Serbaguna Gedung B", agenda: "Pengenalan alur persuratan digital dan praktik penggunaan sistem", nama_penerima: "Seluruh Pegawai" },
    },
  ];

  for (const spec of SPECS) {
    const templateInfo = templateRows[spec.template];
    const createdAt = monthsAgo(spec.monthsAgo, 6, 8);
    const [letter] = await db
      .insert(letters)
      .values({
        title: spec.title,
        categoryId: categoryRows[spec.category],
        templateId: templateInfo.id,
        departmentId: spec.sender.departmentId,
        senderId: spec.sender.id,
        recipientName: spec.recipient,
        recipientPosition: spec.recipientPosition,
        recipientAddress: spec.recipientAddress,
        letterDate: iso(spec.monthsAgo),
        classification: spec.classification ?? "biasa",
        priority: spec.priority ?? "normal",
        data: spec.data,
        bodyText: renderTemplateText(templateInfo.body, spec.data),
        status: "draft",
        stageEnteredAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      })
      .returning();

    try {
      await advance(letter.id, spec.target, spec, actors);
    } catch {
      // lanjut ke surat berikutnya bila sebuah tahap gagal diproses
    }

    // Sesuaikan penanggalan agar riwayat terlihat natural dan grafik bulanan terisi.
    await db
      .update(letters)
      .set({
        createdAt,
        updatedAt: new Date(createdAt.getTime() + 3600_000),
        submittedAt: sql`coalesce(${letters.submittedAt}, ${new Date(createdAt.getTime() + 1800_000)})`,
        stageEnteredAt: new Date(createdAt.getTime() + 2 * 3600_000),
      })
      .where(eq(letters.id, letter.id));
    await db
      .update(letterApprovals)
      .set({
        createdAt,
        dueAt: new Date(createdAt.getTime() + 24 * 3600_000),
      })
      .where(eq(letterApprovals.letterId, letter.id));
    await db.execute(sql`
      update letter_approvals
      set acted_at = ${new Date(createdAt.getTime() + 3 * 3600_000)}
      where letter_id = ${letter.id} and acted_at is not null
    `);
  }

  await db.delete(notifications);
  const pendingApprovals = await db
    .select()
    .from(letterApprovals)
    .where(eq(letterApprovals.status, "pending"))
    .orderBy(asc(letterApprovals.id));
  const roleToUser: Record<string, SessionUser> = {
    [ROLE.ADMIN]: actors.admin,
    [ROLE.REVIEWER]: actors.reviewer,
    [ROLE.APPROVER]: actors.approver,
    [ROLE.SUPER_ADMIN]: actors.superadmin,
  };
  const notificationValues = pendingApprovals
    .filter((approval) => roleToUser[approval.roleCode])
    .map((approval) => ({
      userId: roleToUser[approval.roleCode].id,
      letterId: approval.letterId,
      type: "persetujuan",
      title: "Surat menunggu tindakan Anda",
      message: `Tahap "${approval.label}" menunggu pemeriksaan/persetujuan.`,
      link: `/surat/${approval.letterId}`,
      isRead: false,
      createdAt: new Date(),
    }));
  if (notificationValues.length) await db.insert(notifications).values(notificationValues);

  return {
    skipped: false,
    summary: `${USER_SEEDS.length} pengguna, ${TEMPLATE_PRESETS.length} template, ${WORKFLOWS.length} alur, ${SPECS.length} surat`,
  };
}

function labelFor(key: string): string {
  const special: Record<string, string> = {
    nomor_surat: "Nomor Surat",
    tanggal_surat: "Tanggal Surat",
    nama_penerima: "Nama Penerima",
    jabatan_penerima: "Jabatan Penerima",
    alamat_penerima: "Alamat Penerima",
    perihal: "Perihal",
    isi_surat: "Isi Surat",
    unit_kerja: "Unit Kerja",
    tahun_anggaran: "Tahun Anggaran",
    nama_kegiatan: "Nama Kegiatan",
    hari_tanggal: "Hari / Tanggal",
    waktu: "Waktu",
    tempat: "Tempat",
    agenda: "Agenda",
    nama_ybs: "Nama Yang Bersangkutan",
    nomor_identitas: "NIP / NIK",
    jabatan_ybs: "Jabatan",
    isi_keterangan: "Isi Keterangan",
    keperluan: "Keperluan",
    nama_petugas: "Nama Petugas",
    jabatan_petugas: "Jabatan Petugas",
    tujuan_tugas: "Tujuan Tugas",
    tempat_tugas: "Tempat Tugas",
    tanggal_pelaksanaan: "Tanggal Pelaksanaan",
    asal_surat: "Asal Surat",
    nomor_surat_masuk: "Nomor Surat Masuk",
    tanggal_surat_masuk: "Tanggal Surat Masuk",
    perihal_masuk: "Perihal Surat Masuk",
    isi_disposisi: "Isi Disposisi",
    batas_waktu: "Batas Waktu",
  };
  return (
    special[key] ??
    key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function typeFor(key: string): string {
  if (key.includes("tanggal")) return "date";
  if (key.startsWith("isi") || key.includes("agenda") || key.includes("keterangan")) return "textarea";
  if (key.includes("tahun") || key.includes("jumlah")) return "number";
  return "text";
}

type ActorSet = {
  admin: SessionUser;
  reviewer: SessionUser;
  approver: SessionUser;
  user1: SessionUser;
  user2: SessionUser;
  superadmin: SessionUser;
};

async function advance(
  letterId: number,
  target: string,
  spec: { sender: SessionUser },
  actors: ActorSet,
) {
  if (target === "draft") return;
  await submitLetter(letterId, spec.sender);
  if (target === "menunggu_pemeriksaan") return;

  const first = await currentStep(letterId);
  if (!first) return;
  const actorFor = (roleCode: string): SessionUser =>
    ({
      [ROLE.ADMIN]: actors.admin,
      [ROLE.REVIEWER]: actors.reviewer,
      [ROLE.APPROVER]: actors.approver,
      [ROLE.SUPER_ADMIN]: actors.superadmin,
    })[roleCode] ?? actors.admin;

  if (target === "dalam_pemeriksaan") {
    await actOnLetter(letterId, actorFor(first.roleCode), "review");
    return;
  }
  if (target === "revisi") {
    await actOnLetter(
      letterId,
      actorFor(first.roleCode),
      "revision",
      "Mohon lengkapi data pendukung dan perbaiki redaksi pada bagian identitas serta keperluan surat sebelum diajukan kembali.",
    );
    return;
  }

  const allSteps = await db
    .select()
    .from(letterApprovals)
    .where(eq(letterApprovals.letterId, letterId))
    .orderBy(asc(letterApprovals.stepOrder));
  const totalSteps = allSteps.length;

  if (target === "ditolak") {
    await actOnLetter(letterId, actorFor(allSteps[0].roleCode), "approve", "Kelengkapan administrasi sudah sesuai.");
    const second = await currentStep(letterId);
    if (second) {
      await actOnLetter(
        letterId,
        actorFor(second.roleCode),
        "reject",
        "Penambahan anggaran belum dapat disetujui karena pagu triwulan berjalan sudah terkunci. Ajukan kembali pada periode anggaran berikutnya.",
      );
    }
    return;
  }

  const approvalsNeeded = target === "menunggu_persetujuan" ? totalSteps - 1 : totalSteps;
  for (let i = 0; i < approvalsNeeded; i += 1) {
    const step = await currentStep(letterId);
    if (!step) break;
    await actOnLetter(
      letterId,
      actorFor(step.roleCode),
      "approve",
      i === approvalsNeeded - 1 && approvalsNeeded === totalSteps
        ? "Disetujui. Surat dinyatakan sah dan dapat diterbitkan."
        : "Dokumen telah diperiksa, substansi sesuai ketentuan. Diteruskan ke tahap berikutnya.",
    );
  }

  if (target === "selesai" || target === "diarsipkan") {
    await actOnLetter(letterId, actors.admin, "distribute");
  }
  if (target === "diarsipkan") {
    await actOnLetter(letterId, actors.admin, "archive");
  }
}

async function currentStep(letterId: number) {
  const rows = await db
    .select()
    .from(letterApprovals)
    .where(eq(letterApprovals.letterId, letterId))
    .orderBy(asc(letterApprovals.stepOrder));
  const activeCycle = rows.reduce((max, r) => Math.max(max, r.cycle), 1);
  return rows.filter((r) => r.cycle === activeCycle).find((r) => r.status === "pending") ?? null;
}

export const SEED_PASSWORD = DEMO_PASSWORD;
export const SEED_TODAY = new Date().toISOString().slice(0, 10);
