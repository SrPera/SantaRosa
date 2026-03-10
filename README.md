# Santa Rosa 3D – Mapa Interactivo del Barrio

Mapa 3D interactivo del barrio Santa Rosa en Cali, Colombia.  
Construido con **Three.js** y datos reales de **OpenStreetMap**.

---

## 📁 Estructura del proyecto

```
/project
  index.html          ← Página principal (iframe-ready)
  style.css           ← Estilos y UI overlay
  script.js           ← Lógica 3D completa (Three.js + OSM)
  barrio-textura.jpg  ← Textura aérea del barrio (agregar tu imagen)
  pin.png             ← Ícono pin alternativo (opcional)
  README.md           ← Este archivo
```

---

## 🚀 Cómo usar

### Localmente
Abre `index.html` directamente en el navegador (doble clic).  
> Nota: Para cargar la textura `barrio-textura.jpg` desde una URL local puede
> requerirse un servidor local. Usa `npx serve .` o VS Code Live Server.

### En GitHub Pages
1. Sube todos los archivos a un repositorio de GitHub.
2. Ve a **Settings → Pages → Source → main branch / root**.
3. Tu URL será: `https://<usuario>.github.io/<repo>/`

### Embebido en Wix Studio (iframe)
```html
<iframe
  src="https://<usuario>.github.io/<repo>/"
  width="100%"
  height="100%"
  style="border:none;"
  allow="fullscreen"
></iframe>
```

---

## 🗺️ Hotspots y navegación Wix

Cada hotspot envía un `postMessage` al padre cuando se hace clic.  
En tu página Wix Studio agrega este código:

```javascript
window.addEventListener('message', (event) => {
  const section = event.data; // 'barrio', 'dofa', 'ecosistema', 'fotorrelato', 'equipo'
  // Navega a la sección correspondiente:
  // wixSite.scrollTo(section);
  console.log('Sección solicitada:', section);
});
```

---

## ➕ Agregar un nuevo hotspot

En `script.js`, localiza el array `HOTSPOTS` y agrega un objeto:

```javascript
{
  name: 'mi_seccion',        // clave enviada por postMessage
  label: 'Mi Sección',       // etiqueta visible
  icon: '🏫',                // emoji
  description: 'Descripción breve de este punto.',
  lat: 3.4510,               // latitud OSM
  lon: -76.5312,             // longitud OSM
},
```

---

## 🎨 Paleta de colores

| Nombre         | Hex       |
|----------------|-----------|
| Azul petróleo  | `#1F3A5F` |
| Terracota      | `#C65D3B` |
| Crema claro    | `#F4EDE4` |
| Gris concreto  | `#5C5C5C` |
| Verde hoja     | `#4F7A5B` |

---

## 🖼️ Textura del barrio

Reemplaza `barrio-textura.jpg` con una imagen aérea real del barrio.  
Sugerencia: descarga una captura de **Google Earth** o **Mapbox Satellite**
sobre el área `3.4503,−76.5331 → 3.4523,−76.5298`.

---

## 🛠️ Tech Stack

- [Three.js r128](https://threejs.org/) – Motor 3D WebGL
- [OpenStreetMap](https://www.openstreetmap.org/) – Datos geográficos
- [Overpass API](https://overpass-api.de/) – Consultas OSM en tiempo real

---

## 📄 Licencia

Datos cartográficos © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL).  
Código © 2024 – Proyecto Comunicación Barrio Santa Rosa.
