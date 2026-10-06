# Source images

The uncompressed originals. **This folder is NOT published**: what the site
serves lives in `public/`, and a 2 MB PNG there would be downloaded whole on
every visit to look the same as a 60 KB WebP.

| Source                                   | Published as              | Weight |
| ---------------------------------------- | ------------------------- | ------ |
| `login-background.png` (1536×1024, 2 MB) | `public/fondo-login.webp` | 60 KB  |

## How to regenerate

```bash
cwebp -q 82 -m 6 -sharp_yuv assets-source/login-background.png -o public/fondo-login.webp
```

`q=82` is not a random number: it gives 43.4 dB of PSNR, above the ~42 dB where
the eye stops noticing the difference. Going up to 86 doubles the weight and
only gains 0.65 dB.

`-sharp_yuv` matters for this image: it has clean edges between the lime and
the green, and without it the chroma subsampling leaves them fringed.
