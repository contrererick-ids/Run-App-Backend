# 🏋️‍♂️ Backend

## 📌 Definición de Proyecto
Una aplicación web que permite el **registro**, **seguimiento de actividades** y **carreras** para usuarios que practican ejercicio de manera constante.  

Entre sus funcionalidades principales se encuentra un **calendario** para agendar actividades deportivas y un **sistema de seguimiento de métricas** en distintas competencias y carreras.

---

## 🛠️ Tecnologías / Lenguajes / Frameworks
- **Node.js** con **Express**  
- **JavaScript (JS)**  
- **MongoDB** con **Mongoose**

---

## 🗂️ Estructura de Archivos
En el backend se implementó el patrón **MC (Modelo-Controlador)**.  
> Como no existen vistas, se utiliza MC en lugar de MVC.  
> Referencia: [Introducción al framework MVC – GeeksForGeeks](https://www.geeksforgeeks.org/software-engineering/mvc-framework-introduction/)

```
src
├── index.js
│
├── Models
│ ├── userModel.js
│ └── planModel.js
│
└── Controllers
├── userController.js
└── trainingController.js
```

---
## Requerimientos
- **Node.js**
- Conexión a Base de Datos de MONGO
- Correr el [**Frontend**](https://github.com/contrererick-ids/Run-App-Project-Web-Development)

## Cómo Contribuir
- Crea un Fork
- Gurada tus cambios
- Crea un Pull Request para nuestro repositorio

## Cómo correr la App
- Instalas en la terminal npm i
- Corres con npm start
