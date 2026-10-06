#!/usr/bin/env python3
"""Extract the application icon group from disc/lavender/lavender.exe.

The site icon in web-app/public/ (favicon.ico and the PNG renders used by
index.html) is the game's own Windows icon, not a hand-made asset. The
executable lives in the gitignored disc/ tree, so this script documents
how the committed files were produced. It parses the PE resource section
(RT_GROUP_ICON + RT_ICON) with the standard library only.

Usage:
    python3 docs/extract_exe_icon.py disc/lavender/lavender.exe /tmp/icons

Then, with ImageMagick:
    magick /tmp/icons/lavender.exe_*.ico[0] -resize 32x32 favicon-32.png
    magick <256 frame> -background white -flatten -bordercolor white \\
        -border 8 -resize 180x180 apple-touch-icon.png   (192/512 likewise)
favicon.ico itself is the reconstructed multi-resolution icon, unchanged.
"""
import os
import struct
import sys


def extract(path):
    d = open(path, "rb").read()
    pe = struct.unpack_from("<I", d, 0x3C)[0]
    assert d[pe:pe + 4] == b"PE\0\0"
    coff = pe + 4
    nsec = struct.unpack_from("<H", d, coff + 2)[0]
    opt = coff + 20
    magic = struct.unpack_from("<H", d, opt)[0]
    dd_off = opt + (96 if magic == 0x10B else 112)  # PE32 : PE32+
    res_rva, _ = struct.unpack_from("<II", d, dd_off + 2 * 8)  # entry 2 = .rsrc
    sec_off = opt + struct.unpack_from("<H", d, coff + 16)[0]
    sections = []
    for i in range(nsec):
        o = sec_off + i * 40
        vsz, vrva, rsz, rraw = struct.unpack_from("<IIII", d, o + 8)
        sections.append((vrva, vsz, rraw, rsz))

    def rva2off(rva):
        for vrva, vsz, rraw, rsz in sections:
            if vrva <= rva < vrva + max(vsz, rsz):
                return rraw + (rva - vrva)
        raise ValueError("unmapped RVA %#x" % rva)

    base = rva2off(res_rva)
    icons, groups = {}, {}

    def walk(off, depth, ids):
        n_named, n_id = struct.unpack_from("<HH", d, base + off + 12)
        for i in range(n_named + n_id):
            name_or_id, child = struct.unpack_from("<II", d, base + off + 16 + i * 8)
            leaf_ids = ids + [name_or_id]
            if child & 0x80000000:
                walk(child & 0x7FFFFFFF, depth + 1, leaf_ids)
                continue
            do = base + child
            data_rva, data_size, _, _ = struct.unpack_from("<IIII", d, do)
            raw = d[rva2off(data_rva):rva2off(data_rva) + data_size]
            if depth == 2 and ids[0] in (3, 14):  # RT_ICON / RT_GROUP_ICON
                (icons if ids[0] == 3 else groups)[leaf_ids[1]] = raw

    walk(0, 0, [])
    return icons, groups


def build_ico(group, icons):
    _, _, count = struct.unpack_from("<HHH", group, 0)
    meta, blobs = [], []
    for i in range(count):
        w, h, cc, rs, planes, bpp, _size, gid = struct.unpack_from(
            "<BBBBHHIH", group, 6 + i * 14)
        blobs.append(icons[gid])
        meta.append((w, h, cc, rs, planes, bpp))
    head = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries, body = b"", b""
    for (w, h, cc, rs, planes, bpp), raw in zip(meta, blobs):
        entries += struct.pack("<BBBBHHII", w, h, cc, rs, planes, bpp,
                               len(raw), offset)
        body += raw
        offset += len(raw)
    return head + entries + body


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: extract_exe_icon.py <game.exe> <outdir>")
    exe, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    icons, groups = extract(exe)
    stem = os.path.splitext(os.path.basename(exe))[0]
    for gid, group in groups.items():
        out = os.path.join(outdir, "%s_%d.ico" % (stem, gid & 0x7FFFFFFF))
        open(out, "wb").write(build_ico(group, icons))
        print("wrote", out)


if __name__ == "__main__":
    main()
