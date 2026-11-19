# File formats

This page defines the three public formats of the site. Each section ends with a small worked example. Every number
of these examples is re-checked by the test suite (`tests/formats/formats.test.mjs` reads the marked blocks of this
file), so the page cannot drift from the code.

## Conventions

- The cell $(x,d)\in\mathbb Z^{2}$ has the region type $K(x,d)=\left(\frac xd\right)$, the Kronecker symbol, drawn
  $0$ blue, $+1$ green, $-1$ red. The field `colour` of every format holds this region type (colour = region type). For all integers: $K(a,0)=1$ when $a=\pm1$, else $0$. For $n<0$:
  $K(a,n)=K(a,-1)K(a,-n)$ with $K(a,-1)=-1$ exactly when $a<0$. For $n>0$ write $n=2^{e}n'$ with $n'$ odd, then
  $K(a,n)=K(a,2)^{e}J(a,n')$ where $J$ is the Jacobi symbol and $K(a,2)=0,+1,-1$ for $a$ even,
  $a\equiv\pm1$, $a\equiv\pm3 \pmod 8$. So $K(x,d)=0$ exactly when $\gcd(x,d)\ne1$.
- The six neighbours of $(x,d)$ are $(x\pm1,d)$, $(x,d\pm1)$, $(x+1,d+1)$ and $(x-1,d-1)$.
- A region is a maximal connected set of cells of the same region type. Its area is its number of cells. The genus of a finite
  region is $1-\chi$ with $\chi$ = cells $-$ edges $+$ triangles, where the edges are the neighbouring pairs inside
  the region and the triangles are the triples $\{(x,d),(x+1,d),(x+1,d+1)\}$ and $\{(x,d),(x,d+1),(x+1,d+1)\}$
  inside it. It equals the number of bounded components of the complement.
- Offsets: a shape is a list of integer pairs $(i,j)$, and the cell of the offset $(i,j)$ is $(x_0+i,\ d_0+j)$ for the
  base point $(x_0,d_0)$, which the pages write $(x,d)$ (the fields keep the names `x0`, `d0`).
  $N(S)$ is the set of cells adjacent to $S$ and not in $S$, the window is $W=S\cup N(S)$.
- Every list of cells written by the site is sorted by $(j,i)$ ascending (row first). Readers accept any order.
- Big integers are always plain decimal strings: an optional `-`, digits, no `+`, no leading zeros, no white space.
  The sha256 values of the formats are taken over these strings (ASCII bytes).
- Every shape the site receives (in a witness, a packed file or a token) is checked before it is shown: a non-empty
  list of integer pairs $[i,j]$ with $\lvert i\rvert,\lvert j\rvert<2^{20}$ and no cell twice. A shape that fails
  is refused with the code `bad_format`, `out_of_range` or `duplicate_cell`.

## 1. Witness: `kron_hex_witness_v1`

A witness states a region: its region type (field `colour`), genus and area, a base cell $(x_0,d_0)$ of any size, and the offsets of all
its cells. It can be checked without knowing how it was found. The Explorer's download button saves the region it
shows in this format (a region found by a click has the clicked cell as base cell and seed $(0,0)$, `id` null), and its
open button reads such a file again.

| Field | Type | Meaning |
|---|---|---|
| `format` | string | `"kron_hex_witness_v1"` |
| `id` | string or null | a name, for example `green_g010` |
| `colour` | number | the region type: `1` green, `-1` red, `0` blue |
| `genus` | number | genus of the region |
| `area` | number | number of cells |
| `x0`, `d0` | string | decimal strings of the base cell |
| `seed` | `[i, j]` | offset of one cell of the region |
| `shape` | list of `[i, j]` | offsets of all cells of the region |
| `window` | `{imin, imax, jmin, jmax}` | optional, a box that holds $S\cup N(S)$ |
| `digits` | `{x0, d0}` | optional, the digit counts of $\lvert x_0\rvert$ and $\lvert d_0\rvert$ |
| `construction` | object | optional, free notes on how the witness was made (ignored by the check) |

**Check.** A stated area that differs from the number of cells of the shape fails at once, without a flood fill.
Otherwise the region of the seed cell $(x_0+s_i,\ d_0+s_j)$ is recomputed by flood fill with a cap of 10 times the
number of cells of the shape. The witness passes when the fill closes below the cap, its colour, area and genus are the stated ones,
its cells are exactly the stated shape, the stated shape itself has the stated genus by the $\chi$ formula, the
shape has no duplicate cell, the seed is a cell of the shape and the digit counts (when present) are right. A window
that does not hold $S\cup N(S)$ gives a warning, not a failure.

**Example.** The blue region of the cell $(-34,-54)$ has 10 cells and one hole:

<!-- check:witness-example -->
```json
{"format":"kron_hex_witness_v1","id":"blue_g001_example","colour":0,"genus":1,"area":10,"x0":"-34","d0":"-54","seed":[0,0],"shape":[[-2,-4],[-2,-3],[-2,-2],[-1,-2],[0,-2],[-1,-1],[1,-1],[0,0],[1,0],[2,0]],"window":{"imin":-3,"imax":3,"jmin":-5,"jmax":1},"digits":{"x0":2,"d0":2}}
```

The hole is the cell $(0,-1)$, the offset between $(-1,-1)$ and $(1,-1)$: it is $(-34,-55)$, and
$\gcd(34,55)=1$, so it is not blue. The counts of the $\chi$ formula:

<!-- check:witness-chi -->
```text
cells = 10, edges = 13, triangles = 3, chi = 0, genus = 1
```

## 2. Packed region: `kron_hex_packed_v1`

A green or red region built by the construction of the site is described by far fewer data than its witness: the
residues that fix $d_0$ and $x_0$, and a bitmap of the shape. $x_0$ and $d_0$ are rebuilt by the Chinese remainder
theorem.

| Field | Meaning |
|---|---|
| `format`, `format_note` | `"kron_hex_packed_v1"` and a one-paragraph summary of this section |
| `id`, `colour`, `genus`, `area`, `seed`, `window` | as in the witness (`colour` is `1` or `-1`, `window` is the box of $S\cup N(S)$) |
| `shape_origin`, `shape_rows` | the cell $(i_0+t,\ j_0+r)$ is in the shape exactly when bit $t$ (least significant bit $=0$) of the hex number `shape_rows[r]` is set, with `shape_origin` $=[i_0,j_0]$ the smallest $i$ and $j$ of the shape |
| `B` | the small primes are all primes $p\le B$ |
| `small_primes` | `small_primes[p]` $=[x_0 \bmod p,\ d_0 \bmod p]$, the second entry `null` when $d_0$ is not constrained modulo $p$. For $p=2$ the first entry is $x_0\bmod 8$ |
| `d0_index` | which solution of the $d_0$ congruences is taken (see below), a number or a decimal string |
| `rows` | a list of `[j, q1, q2, r1, r2, rho]`, ascending in $j$. `rho` is a number or a decimal string |
| `sha256`, `digits` | sha256 and digit counts of the decimal strings of $x_0$ and $d_0$ |

**Rebuilding $d_0$.** Let $(D,M_d)$ be the CRT solution, $0\le D<M_d$, of the non-null residues $d_0\bmod p$ and of
$d_0\equiv-j\pmod{q_1q_2}$ for every row. Then $d_0=D+\text{d0\_index}\cdot M_d$.

**Rebuilding $x_0$.** For every row write $d_0+j=u_j q_1 q_2 c_j$ where $u_j$ is the part of $d_0+j$ made of the
primes $\le B$ (the row primes $q_1,q_2$ must divide what is left). Then $x_0$ is the smallest POSITIVE solution of
$x_0\equiv$ the first entries of `small_primes` (modulo 8 for $p=2$, modulo $p$ otherwise), $x_0\equiv r_1
\pmod{q_1}$, $x_0\equiv r_2\pmod{q_2}$ and $x_0\equiv R\pmod{c_j}$ for every row, with $R$ the field `rho`. A CRT
solution $0$ is replaced by the modulus. The moduli are pairwise coprime by construction, a reader rejects a file where they are not.

A reader also rejects: a JSON number that is not a safe integer (below $2^{53}$ in size, larger values must be
decimal strings), a stated area, window or genus that differs from the shape, a seed outside the shape,
`small_primes` that do not list exactly the primes $\le B$, and a rebuilt $x_0$ or $d_0$ whose sha256 or digit count
differs from the stored one.

**Example.** A red strip of three cells $(0,0),(1,0),(2,0)$ (`format_note` shortened here):

<!-- check:packed-example -->
```json
{"format":"kron_hex_packed_v1","format_note":"...","id":"red_strip3","colour":-1,"genus":0,"area":3,"seed":[0,0],"window":{"imin":-1,"imax":3,"jmin":-1,"jmax":1},"shape_origin":[0,0],"shape_rows":["7"],"B":7,"small_primes":{"2":[2,1],"3":[0,2],"5":[0,4],"7":[3,null]},"d0_index":1,"rows":[[-1,17,19,4,0,0],[0,67,71,25,2,2],[1,23,29,4,0,0]],"sha256":{"x0":"203c9abee909e67466f9d59caf47bd9464a86a4c2f6974216967a6e38777222c","d0":"350c7bd4b7b850f27f1a11d1fa6a8d5f7173ca7e83faf271355dc60fa8311899"},"digits":{"x0":29,"d0":11}}
```

The $d_0$ congruences are $d_0\equiv1\pmod2$, $2\pmod3$, $4\pmod5$ and $d_0\equiv1\pmod{17\cdot19}$,
$0\pmod{67\cdot71}$, $-1\pmod{23\cdot29}$. The rebuilt numbers:

<!-- check:packed-numbers -->
```text
D = 10912353449
M_d = 30745585110
d0 = 41657938559
row -1: u = 2, c = 64485973
row 0: u = 1, c = 8757187
row 1: u = 40320, c = 1549
x0 = 75121342680439633190350918050
```

So $d_0-1=2\cdot17\cdot19\cdot64485973$, $d_0=67\cdot71\cdot8757187$ and $d_0+1=40320\cdot23\cdot29\cdot1549$.
The colours of the window, the strip and its 10 neighbours (`+` green, `-` red, `0` blue):

<!-- check:packed-window -->
```text
j = -1, i = -1 .. 2: + 0 + 0
j = 0, i = -1 .. 3: + - - - +
j = 1, i = 0 .. 3: 0 + 0 0
```

No neighbour is red, so the red region of $(x_0,d_0)$ is exactly the strip.

## 3. URL token: `kron_hex_bin_v1`

The same content as a packed file, as a bit stream written in base64url (alphabet `A-Z a-z 0-9 - _`, no padding),
short enough for a link. Area, window, digit counts and the two sha256 values are not stored, they are recomputed.
A 4-byte tag replaces the hashes.

`token = base64url(body bytes + 4 tag bytes)`. The body is read most significant bit first and padded with zero
bits to a whole byte. Codes: $u(w)$ is an unsigned integer on $w$ bits, $g(n)$ the Elias gamma code of $n\ge1$
($L-1$ zero bits, then the $L$ bits of $n$), $sg(n)=g(z(n)+1)$ with the zigzag map $z(n)=2n$ for $n\ge0$ and
$-2n-1$ for $n<0$, and $w(m)$ is the bit length of $m-1$ (the width of a residue modulo $m$). The fields in order:

1. $u(4)$ version $=1$.
2. $u(1)$ colour: 1 green, 0 red.
3. $u(1)$ has_id, and when 1: $g(\text{length})$, then length times $u(7)$ ASCII.
4. $g(\text{genus}+1)$.
5. $g(B)$: the small primes are all primes $p\le B$.
6. $sg(i_0)$, $sg(j_0)$: the shape origin.
7. $g(n_r)$: the number $n_r$ of shape rows, row $r$ is the row $j_0+r$ and holds at least one cell. Row 0: $g(lo+1)$,
   $g(hi-lo+1)$, where $lo$ and $hi$ are the smallest and largest $t$ with the cell $(i_0+t,\ j_0+r)$ in the shape.
   Row $r\ge1$: $sg(lo-lo_{prev})$, $sg(hi-hi_{prev})$. Every row: its header, then the $\max(hi-lo-1,0)$ raw bits of
   the cells $t=lo+1,\dots,hi-1$ in this order (none for a row of one cell).
8. $g(s_i-i_0+1)$, $g(s_j-j_0+1)$: the seed cell, a cell of the shape.
9. For every prime $p\le B$ ascending: $u(3)$ $x_0\bmod8$ when $p=2$, else $u(w(p))$ $x_0\bmod p$. Then $u(1)$
   "$d_0$ is constrained modulo $p$", and when 1: $u(w(p))$ $d_0\bmod p$.
10. $g(\text{d0\_index}+1)$.
11. $n_r+2$ bits: the window row $j=j_0-1+t$ has a row entry or not ($t=0,\dots,n_r+1$). Then for every row with an
    entry, ascending $j$: $u(5)$ $e$. For $e\le30$ the row primes $q_1<q_2$ are the two smallest primes
    $\ge\max(2^{e},B+1)$ not used by an earlier row. For $e=31$ they follow explicitly as $g(q_1)$, $g(q_2)$. Then
    $u(w(q_1))$ $r_1$, $u(w(q_2))$ $r_2$, $g(R+1)$ with $R$ the field `rho`.

**Tag** = the first 4 bytes of sha256(body bytes, then the byte of `|`, then the decimal string of $x_0$). It covers
every field and the rebuilt number, so both a damaged link and a wrong reconstruction are rejected. A token is
accepted only when its text is canonical (decoding and encoding again gives the same text, the padding bits are
zero, no bits are left after the last field) and the tag matches. So the shape origin is the smallest $i$ and $j$ of
the shape (a token with the origin further left, its rows moved to match, is `not_canonical`), and a row prime pair
is written explicitly only when the rule does not give it. Structure checks alone cannot detect most single
changes, so the site checks the tag of every token it receives. As for a packed file, a token whose genus field
differs from the genus of its shape is rejected (`bad_format`), and a token whose shape is not connected is
rejected (`not_connected`). These checks need no rebuilt number, so they come before the rebuild.

**Example.** The strip of section 2 without its id:

<!-- check:token-example -->
```text
En99ZhjLkICYyCZCAiNIQQ0
```

Its 13 body bytes split into the fields (bits, field, value):

<!-- check:token-bits -->
```text
0001     version          1
0        colour           red
0        has_id           no
1        g(genus + 1)     1, genus 0
00111    g(B)             7
1        sg(i0)           0
1        sg(j0)           0
1        g(n_r)           1 row
1        g(lo + 1)        lo = 0
011      g(hi - lo + 1)   hi = 2
1        raw bit t = 1    cell (1, 0)
1        g(si - i0 + 1)   si = 0
1        g(sj - j0 + 1)   sj = 0
010      x0 mod 8         2
1        d0 constrained   mod 2
1        d0 mod 2         1
00       x0 mod 3         0
1        d0 constrained   mod 3
10       d0 mod 3         2
000      x0 mod 5         0
1        d0 constrained   mod 5
100      d0 mod 5         4
011      x0 mod 7         3
0        d0 constrained   free mod 7
010      g(d0_index + 1)  1
111      row entries      rows -1, 0, 1
00100    e                4: q1, q2 = 17, 19
00100    r1               4
00000    r2               0
1        g(R + 1)         0
00110    e                6: q1, q2 = 67, 71
0011001  r1               25
0000010  r2               2
011      g(R + 1)         2
00100    e                4: q1, q2 = 23, 29 (17 and 19 are used)
00100    r1               4
00000    r2               0
1        g(R + 1)         0
0        padding
```

The tag is the 4 bytes `2348410d` (hex), the first 4 bytes of the sha256 of the body followed by
`|75121342680439633190350918050`.

### Version 2: blue regions

A token of version 2 holds a blue region (colour 0). Same container, same codes $u$, $g$, $sg$, $w$, same tag and
same canonical rule as version 1. The fields in order:

1. $u(4)$ version $=2$.
2. $u(1)$ has_id, and when 1 the id as in version 1.
3. $g(\text{genus}+1)$, $g(B)$, the shape origin, the shape rows and the seed exactly as fields 4 to 8 of version 1.
4. For every prime $p\le B$ ascending: $u(w(p))$ $x_0\bmod p$, then $u(w(p))$ $d_0\bmod p$. A value $\ge p$ is
   rejected (`out_of_range`).

Version 1 texts start with one of the characters E to H, version 2 texts with one of I to L.

The token stores the shape and one class per small prime, and the rest follows by rule. With $N=N(S)$ the cells
adjacent to the shape $S$ and not in it, $W=S\cup N$, and $h$, $w$ the numbers of rows and columns spanned by $W$:

- $B=\max(h,w,7)$, and the stored $B$ must be this value.
- The residues of $p$ give the class $(a,b)=(-x_0\bmod p,\ -d_0\bmod p)$ of $(\mathbb Z/p)^2$: $p$ divides both
  coordinates of exactly the cells $(x_0+i,\ d_0+j)$ with $i\equiv a$, $j\equiv b\pmod p$. No cell of $N$ may lie in
  a stored class.
- The cells of $S$ in no stored class, in the order $(j,i)$ ascending, get the consecutive primes $q>B$ (the first
  cell the smallest one), with $x_0\equiv-i$ and $d_0\equiv-j\pmod q$.
- $(D,M_d)$ is the solution of all conditions on $d_0$ by the Chinese remainder theorem, $0\le D<M_d$, and
  $d_0=D+tM_d$ for the smallest $t\ge0$ with $d_0+j_{min}\ge1$, where $j_{min}$ is the smallest row of $W$.
- $(X,M_x)$ is the solution of all conditions on $x_0$, $0\le X<M_x$, and $x_0=X+tM_x$ for the smallest $t$, from
  the smallest $t\ge0$ with $x_0+i_{min}\ge1$ on, such that $\gcd(x_0+i,\ d_0+j)=1$ for every cell $(i,j)$ of $N$.

Every cell of $S$ then has a prime dividing both coordinates and every cell of $N$ has coprime coordinates, so the
blue region of the seed cell is exactly the shape. A reader rejects a token whose $B$ or primes do not match the
shape, or whose class holds a cell of $N$ (`replay_mismatch`), before it checks the tag.

**Example.** The triangle $\{(0,0),(1,0),(2,0),(1,1),(2,1),(2,2)\}$ with seed $(0,0)$:

<!-- check:token2-example -->
```text
JPu7vkSXAH5HSdE
```

Its 7 body bytes split into the fields (bits, field, value):

<!-- check:token2-bits -->
```text
0010     version          2
0        has_id           no
1        g(genus + 1)     1, genus 0
00111    g(B)             7
1        sg(i0)           0
1        sg(j0)           0
011      g(n_r)           3 rows
1        g(lo + 1)        row 0: lo = 0
011      g(hi - lo + 1)   hi = 2
1        raw bit t = 1    cell (1, 0)
011      sg(lo - lo')     row 1: lo = 1
1        sg(hi - hi')     hi = 2
011      sg(lo - lo')     row 2: lo = 2
1        sg(hi - hi')     hi = 2
1        g(si - i0 + 1)   si = 0
1        g(sj - j0 + 1)   sj = 0
0        x0 mod 2         0
0        d0 mod 2         0
10       x0 mod 3         2
00       d0 mod 3         0
100      x0 mod 5         4
100      d0 mod 5         4
101      x0 mod 7         5
110      d0 mod 7         6
0000000  padding
```

The classes are $(0,0)$ mod 2, $(1,0)$ mod 3, $(1,1)$ mod 5 and $(2,1)$ mod 7. They hold all six cells, so there
is no private prime, $d_0=174$ and $x_0=194$. The tag is the 4 bytes `7e4749d1` (hex), the first 4 bytes of the
sha256 of the body followed by `|194`.

### The shape alone: the address of the shape editor

The shape editor writes the shape drawn into its address as `#/edit?s=<text>&colour=green|red|blue`. The text is
the shape origin and the shape rows exactly as fields 6 and 7 of version 1, padded with zero bits to a whole byte,
in base64url without padding and without a tag. A shape with an empty row between its lowest and its highest row
has no text, and a text of more than 2000 characters is not written: the address is then the bare `#/edit`. Only
the canonical text of a shape is read (the codes of the token reader). The seed is not stored: a shape read from the
address has as seed its first cell in the order $(j,i)$.

**Example.** The triangle of the version 2 example, its 18 bits `11 011 1 011 1 011 1 011 1` and 6 padding bits:

<!-- check:shape-text-example -->
```text
#/edit?s=3d3A&colour=blue
```

## Error codes

Readers throw an error with a `code` string, never a silent wrong value:

| Code | Raised by | Meaning |
|---|---|---|
| `bad_format` | packed reader, token reader, shape check, writers | a field is missing, of the wrong type, or inconsistent with the shape |
| `out_of_range` | packed reader, token reader, shape check | a number that is not a safe integer, a residue not below its modulus, or a shape coordinate of size $2^{20}$ or more |
| `duplicate_cell` | shape check | a cell listed twice in a shape |
| `bad_alphabet`, `not_canonical`, `truncated`, `unknown_version`, `bad_extent`, `seed_not_in_shape`, `sanity_cap` | token reader | a token that is not a well-formed `kron_hex_bin_v1` text |
| `not_connected` | token reader, shape check of a construction | a shape that is not connected, so it is not a region |
| `not_positive`, `row_primes_do_not_divide`, `not_coprime` | rebuilding | data that do not rebuild a pair $(x_0,d_0)$ |
| `replay_mismatch`, `no_x0` | rebuilding a blue region | stored classes that do not fit the shape, or no $x_0$ among the first 10000 candidates |
| `hash_mismatch`, `digits_mismatch` | packed reader | rebuilt numbers that differ from the stored sha256 or digit counts |
| `tag_mismatch` | token reader | a damaged token or a wrong reconstruction |
