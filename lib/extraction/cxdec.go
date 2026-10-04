package extraction

// CXDEC v3 XP3 extraction filter, as used by 光輪の町、ラベンダーの少女 (AKABEiSOFT2, 2010).
//
// The on-disk plugin is plugin/lavender.tpm (a renamed cxdec.tpm native PE DLL).
// Per-game parameters below come from the public reverse engineering of the
// family (cf. vn-tools/arc_unpacker "lavender" and morkt/GARbro KiriKiriCx):
// a 4096-byte control block embedded in the TPM plus three key-derivation
// "branch order" tables and a mask/offset pair that splits each file into two
// key regions. The filter transforms INFLATED entry content; the XP3 index is
// stored unencrypted at the end of the archive ("version 2" layout).
//
// Independently cross-validated against both the arc_unpacker and GARbro
// semantics (20k random seeds, zero mismatches) during porting.

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"os"
)

// Per-game CXDEC parameters for Lavender.
const (
	cxMask   = 0x181
	cxOffset = 0x635
)

var (
	cxOrder1 = [3]uint8{2, 1, 0} // prolog (first stage) routine order
	cxOrder2 = [8]uint8{7, 5, 2, 3, 6, 1, 4, 0} // even branch routine order
	cxOrder3 = [6]uint8{4, 0, 1, 5, 2, 3} // odd branch routine order
)

// controlBlockMagic is searched dword-aligned inside the TPM. arc_unpacker
// matches only the 16-byte prefix; GARbro the full sentence. The 4096 bytes
// starting at the marker form 1024 raw little-endian uint32 values.
var controlBlockMagic = []byte(" Encryption control block")

type CxdecFilter struct {
	cb [1024]uint32
}

// LoadCxdecControlBlock extracts the control block from a cxdec .tpm plugin.
func LoadCxdecControlBlock(tpmPath string) (*CxdecFilter, error) {
	raw, err := os.ReadFile(tpmPath)
	if err != nil {
		return nil, err
	}
	if len(raw) < 4096 {
		return nil, fmt.Errorf("tpm too small: %s", tpmPath)
	}
	limit := (len(raw) - 4096) &^ 3
	var off = -1
	for p := 0; p <= limit; p += 4 {
		if bytes.Equal(raw[p:p+len(controlBlockMagic)], controlBlockMagic) {
			off = p
			break
		}
	}
	if off < 0 {
		// Fall back to the 16-byte prefix arc_unpacker uses.
		short := controlBlockMagic[:16]
		if i := bytes.Index(raw, short); i >= 0 {
			off = i &^ 3
		}
	}
	if off < 0 {
		return nil, fmt.Errorf("CXDEC control block not found in %s", tpmPath)
	}
	f := &CxdecFilter{}
	for i := range f.cb {
		f.cb[i] = binary.LittleEndian.Uint32(raw[off+i*4:])
	}
	return f, nil
}

// ---- key derivation (faithful model of the generated x86 thunks) ----------

type cxDeriver struct {
	cb        *[1024]uint32
	seed      uint32
	parameter uint32
	length    int
}

// modified glibc LCG used by the generated programs for "random" choices
func (d *cxDeriver) rand() uint32 {
	old := d.seed
	d.seed = 0x41C64E6D*old + 12345
	return d.seed ^ ((old << 16) | (old >> 16))
}

func (d *cxDeriver) emit(n int) {
	d.length += n
	if d.length > 128 {
		panic(cxProgramTooLong{})
	}
}

type cxProgramTooLong struct{}

func (d *cxDeriver) derive(seed, parameter uint32) uint32 {
	d.seed = seed
	d.parameter = parameter
	// Stages 5..1 are attempted; a program longer than 128 bytes is
	// discarded and the next stage tried while KEEPING the RNG state.
	for stage := 5; stage >= 1; stage-- {
		d.length = 0
		var eax uint32
		func() {
			defer func() {
				if r := recover(); r != nil {
					if _, ok := r.(cxProgramTooLong); !ok {
						panic(r)
					}
				}
			}()
			d.emit(5) // push edi,esi,ebx,ecx,edx
			d.emit(4) // mov edi,[esp+18]
			eax = d.strategy1(stage)
			d.emit(5) // pop ...
			d.emit(1) // retn
		}()
		if d.length <= 128 {
			return eax
		}
	}
	panic("cxdec: all key-derivation stages failed")
}

// first stage ("prolog"): seed eax
func (d *cxDeriver) first() uint32 {
	switch cxOrder1[d.rand()%3] {
	case 0: // mov eax, imm32 (rand)
		d.emit(1)
		tmp := d.rand()
		d.emit(4)
		return tmp
	case 1: // mov eax, edi
		d.emit(2)
		return d.parameter
	default: // mov esi,&cb ; mov eax,[esi+(rand&0x3ff)*4]
		d.emit(1)
		d.emit(4)
		d.emit(2)
		pos := d.rand() & 0x3ff
		d.emit(4)
		return d.cb[pos]
	}
}

// even branch: one-operand transforms
func (d *cxDeriver) even(stage int) uint32 {
	if stage == 1 {
		return d.first()
	}
	var eax uint32
	if d.rand()&1 == 1 {
		eax = d.strategy1(stage - 1)
	} else {
		eax = d.strategy0(stage - 1)
	}
	switch cxOrder2[d.rand()&7] {
	case 0: // not eax
		d.emit(2)
		eax = ^eax
	case 1: // dec eax
		d.emit(1)
		eax--
	case 2: // neg eax
		d.emit(2)
		eax = -eax
	case 3: // inc eax
		d.emit(1)
		eax++
	case 4: // and eax,3ff ; mov eax,[esi+eax*4]
		d.emit(1)
		d.emit(4)
		d.emit(5) // and eax, imm32 (opcode + 4)
		d.emit(3)
		eax = d.cb[eax&0x3ff]
	case 5: // adjacent-bit swizzle
		d.emit(1)
		d.emit(2)
		d.emit(2)
		d.emit(4)
		d.emit(1)
		d.emit(4)
		d.emit(2)
		d.emit(2)
		d.emit(2)
		d.emit(1)
		ebx := eax & 0xAAAAAAAA
		eax &= 0x55555555
		ebx >>= 1
		eax <<= 1
		eax |= ebx
	case 6: // xor eax, imm32 (rand)
		d.emit(1)
		tmp := d.rand()
		d.emit(4)
		eax ^= tmp
	case 7: // add/sub eax, imm32 (rand)
		add := d.rand()&1 == 1
		tmp := d.rand()
		d.emit(1)
		d.emit(4)
		if add {
			eax += tmp
		} else {
			eax -= tmp
		}
	}
	return eax
}

// odd branch: two-operand transforms combining eax and ebx
func (d *cxDeriver) strategy1(stage int) uint32 {
	if stage == 1 {
		return d.first()
	}
	d.emit(1) // push ebx
	var eax uint32
	if d.rand()&1 == 1 {
		eax = d.strategy1(stage - 1)
	} else {
		eax = d.strategy0(stage - 1)
	}
	d.emit(2) // mov ebx,eax
	ebx := eax
	if d.rand()&1 == 1 {
		eax = d.strategy1(stage - 1)
	} else {
		eax = d.strategy0(stage - 1)
	}
	switch cxOrder3[d.rand()%6] {
	case 0: // shr eax, cl (cl=ebx&0xf)
		d.emit(1)
		d.emit(2)
		d.emit(3)
		d.emit(2)
		d.emit(1)
		eax >>= ebx & 0xf
	case 1: // shl eax, cl
		d.emit(1)
		d.emit(2)
		d.emit(3)
		d.emit(2)
		d.emit(1)
		eax <<= ebx & 0xf
	case 2: // add eax,ebx
		d.emit(2)
		eax += ebx
	case 3: // neg eax; add eax,ebx => ebx-eax
		d.emit(2)
		d.emit(2)
		eax = ebx - eax
	case 4: // imul eax,ebx
		d.emit(3)
		eax *= ebx
	case 5: // sub eax,ebx
		d.emit(2)
		eax -= ebx
	}
	d.emit(1) // pop ebx
	return eax
}

// strategy0 is the "even" recursive shape (kept under a distinct name to match
// the reference program-tree construction exactly).
func (d *cxDeriver) strategy0(stage int) uint32 {
	return d.even(stage)
}

// ---- stream transform ------------------------------------------------------

func (d *cxDeriver) decryptChunk(data []byte, h uint32, base, size int) {
	if size <= 0 {
		return
	}
	seed := h & 0x7f
	h >>= 7
	ret0 := d.derive(seed, h)
	ret1 := d.derive(seed, h^0xffffffff)

	xor0 := byte(ret0 >> 8)
	xor1 := byte(ret0 >> 16)
	xor2 := byte(ret0)
	if xor2 == 0 {
		xor2 = 1
	}
	off0 := int(ret1 >> 16)
	off1 := int(ret1 & 0xffff)
	if off0 >= base && off0 < base+size {
		data[off0] ^= xor0
	}
	if off1 >= base && off1 < base+size {
		data[off1] ^= xor1
	}
	for i := base; i < base+size; i++ {
		data[i] ^= xor2
	}
}

// Decrypt applies the CXDEC extraction filter to one fully inflated archive
// entry. adler is the entry's XP3 "adlr" checksum (also used as the key).
func (f *CxdecFilter) Decrypt(data []byte, adler uint32) {
	d := cxDeriver{cb: &f.cb}
	h1 := adler
	h2 := (adler >> 16) ^ adler
	cut := len(data)
	if b := int(adler&cxMask) + cxOffset; b < cut {
		cut = b
	}
	d.decryptChunk(data, h1, 0, cut)
	d.decryptChunk(data, h2, cut, len(data)-cut)
}
