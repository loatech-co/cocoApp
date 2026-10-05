# Imágenes fuente

Los originales sin comprimir. **Esta carpeta NO se publica**: lo que sirve el
sitio vive en `public/`, y un PNG de 2 MB ahí se descargaría entero en cada
visita para verse igual que un WebP de 60 KB.

| Fuente                              | Se publica como           | Peso  |
| ----------------------------------- | ------------------------- | ----- |
| `fondo-login.png` (1536×1024, 2 MB) | `public/fondo-login.webp` | 60 KB |

## Cómo regenerar

```bash
cwebp -q 82 -m 6 -sharp_yuv assets-fuente/fondo-login.png -o public/fondo-login.webp
```

`q=82` no es un número al azar: da 43.4 dB de PSNR, por encima de los ~42 dB
donde el ojo deja de notar la diferencia. Subir a 86 duplica el peso y solo gana
0.65 dB.

`-sharp_yuv` importa en esta imagen: tiene bordes limpios entre el lima y el
verde, y sin él el submuestreo de color los deja con flecos.
