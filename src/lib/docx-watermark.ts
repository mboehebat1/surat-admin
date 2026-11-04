/**
 * Menghapus watermark dari dokumen Word (OOXML).
 *
 * Word menyimpan watermark sebagai shape VML di `word/header*.xml`:
 *   <w:pict><v:shape id="PowerPlusWaterMarkObject357664185" type="#_x0000_t136" ...>
 *     <v:textpath string="NAMA INSTANSI" .../>
 *   </v:shape></w:pict>
 * Word 2010+ memakai pembungkus `<mc:AlternateContent>` dengan `<wps:wsp><wps:txbx>`.
 * Keduanya dibuang agar dokumen cetak bersih dari tulisan latar.
 */

const WATERMARK_MARKERS =
  /PowerPlusWaterMarkObject|_x0000_t136|textpath|wps:txbx|WaterMark|watermark|<v:shape[^>]*o:spid/i;

/** Potong blok XML secara seimbang berdasarkan tag pembuka/penutup. */
function removeBalanced(xml: string, tag: string): string {
  const open = new RegExp(`<${tag}\\b[^>]*>`, "i");
  const close = new RegExp(`</${tag}>`, "i");

  let result = xml;
  let guard = 0;
  while (guard < 500) {
    guard += 1;
    const openMatch = open.exec(result);
    if (!openMatch) break;

    const startIndex = openMatch.index;
    const openTagName = openMatch[0].slice(1).split(/[\s>/]/)[0];
    const tokenRe = new RegExp(`<(/?)${openTagName}\\b[^>]*?(/?)>`, "gi");
    tokenRe.lastIndex = startIndex;

    let depth = 0;
    let endIndex = -1;
    let token: RegExpExecArray | null;
    while ((token = tokenRe.exec(result)) !== null) {
      const isClose = token[1] === "/";
      const isSelfClose = token[2] === "/";
      if (isClose) {
        depth -= 1;
        if (depth === 0) {
          endIndex = token.index + token[0].length;
          break;
        }
      } else if (!isSelfClose) {
        depth += 1;
      } else if (depth === 0) {
        // tag pembuka yang langsung menutup diri sendiri
        endIndex = token.index + token[0].length;
        break;
      }
    }

    if (endIndex < 0) {
      // struktur tidak seimbang — buang tag pembukanya saja
      result = result.slice(0, startIndex) + result.slice(startIndex + openMatch[0].length);
      continue;
    }
    result = result.slice(0, startIndex) + result.slice(endIndex);
  }

  // Bersihkan penutup yatim jika ada.
  void close;
  return result;
}

export function stripDocxWatermarks(xml: string): string {
  if (!xml || !WATERMARK_MARKERS.test(xml)) return xml;

  let output = xml;

  // 1. Watermark berbasis VML (Word 2003–2007 dan sebagian Word modern).
  output = output.replace(/<w:pict\b[^>]*>[\s\S]*?<\/w:pict>/gi, (block) =>
    WATERMARK_MARKERS.test(block) && /_x0000_t136|textpath|PowerPlusWaterMarkObject/i.test(block) ? "" : block,
  );

  // 2. Watermark berbasis DrawingML di dalam mc:AlternateContent (Word 2010+).
  output = output.replace(/<mc:AlternateContent\b[^>]*>[\s\S]*?<\/mc:AlternateContent>/gi, (block) =>
    /PowerPlusWaterMarkObject|wps:txbx|textpath|WaterMark/i.test(block) ? "" : block,
  );

  // 3. Sisa shape watermark VML yang tidak terbungkus <w:pict>.
  output = output.replace(/<v:shape\b[^>]*(?:PowerPlusWaterMarkObject|o:spid)[^>]*>[\s\S]*?<\/v:shape>/gi, "");
  output = output.replace(/<v:shape\b[^>]*type="#_x0000_t136"[^>]*\/>/gi, "");

  // 4. Blok sisa (mis. mc:Fallback) yang hanya memuat watermark.
  output = removeBalanced(output, "mc:Fallback");

  // 5. Rapikan paragraf kosong bekas watermark agar tidak menambah jarak halaman.
  output = output.replace(/<w:p\b(?:(?!<w:p\b)[\s\S])*?<\/w:p>/gi, (paragraph) =>
    /<w:t\b[^>]*>[^<]*<\/w:t>|<w:drawing\b|<w:pict\b|<w:object\b|<w:br\b/i.test(paragraph) ? paragraph : "",
  );

  return output;
}

/** Part DOCX yang mungkin memuat watermak: header, footer, dan badan dokumen. */
export function isWatermarkCandidatePart(name: string): boolean {
  return /^word\/(header|footer)\d*\.xml$/i.test(name) || /^word\/document\.xml$/i.test(name);
}
