// variables de entorno
import dotenv from 'dotenv';
dotenv.config();

//dependencias principales
import express from 'express';
import cookieParser from 'cookie-parser';
import { MongoClient } from 'mongodb';
import http from 'http';
import { Server } from 'socket.io';

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME;
const COOKIE_SECRET = process.env.COOKIE_SECRET;

const app = express();

app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));
app.use(express.urlencoded({extended:true}));


app.use((req, res, next) => {
  const rutasPublicas = [
    '/login.html',
    '/register',
    '/login',
    '/stylesLog.css',
    '/favicon.ico',
    '/socket.io/socket.io.js'
  ];

  if (
    rutasPublicas.includes(req.path) ||
    req.path.startsWith('/images') ||
    req.path.startsWith('/css') ||
    req.path.startsWith('/js')
  ) {
    return next();
  }

  if (req.cookies.usuario) {
    return next();
  }

  res.redirect('/login.html');
});

app.use(express.static('public'));


const server = http.createServer(app);
const io = new Server(server);


io.on('connection', async (socket) => {
  console.log('🟢 Usuario conectado:', socket.id);

  // --- unión a una sala ---
  socket.on('unirseSala', async ({ usuario, sala }) => {
    socket.join(sala);
    socket.username = usuario;
    socket.room = sala;
    console.log(`👤 ${usuario} se unió a la sala ${sala}`);

    // Enviar lista de usuarios conecados con su estado actual
const usuarios = await global.db.collection('usuarios').find().toArray();
io.emit('usuariosActivos', usuarios);

    // Enviar historial de la sala
    const mensajes = await global.db.collection('mensajes')
      .find({ sala })
      .sort({ fecha: 1 })
      .toArray();

    socket.emit('historial', mensajes);
  });

  // --- envío de mensajes ---
  socket.on('mensaje', async (texto) => {
    if (!socket.username || !socket.room) return;

    const nuevoMsg = {
      usuario: socket.username,
      sala: socket.room,
      mensaje: texto,
      fecha: new Date()
    };

    await global.db.collection('mensajes').insertOne(nuevoMsg);
    io.to(socket.room).emit('nuevoMensaje', nuevoMsg);
  });

  // --- eliminar historial del usuario ---
  socket.on('borrarHistorial', async () => {
    if (!socket.username) return;
    await global.db.collection('mensajes').deleteMany({ usuario: socket.username });
    socket.emit('historialEliminado');
  });

  // --- cambio de estado ---
  socket.on('cambiarEstado', async (nuevoEstado) => {
  if (!socket.username) return;


  await global.db.collection('usuarios').updateOne(
    { username: socket.username },
    { $set: { estado: nuevoEstado } }
  );

  // Envía confirmación al usuario que cambió
  socket.emit('estadoActualizado', nuevoEstado);

  // Envía actualización a todos los demás
  io.emit('estadoUsuario', {
    username: socket.username,
    estado: nuevoEstado
  });
});
  socket.on('disconnect', () => {
    console.log('🔴 Usuario desconectado:', socket.id);
  });
});


//Registro de usuario
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.status(400).send('Faltan datos');

  const existe = await global.db.collection('usuarios').findOne({ username });
  if (existe) return res.status(400).send('Usuario ya existe');

  await global.db.collection('usuarios').insertOne({ username, password, estado: 'disponible' });
  res.send('Usuario registrado correctamente');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await global.db.collection('usuarios').findOne({ username, password });
  if (!user) return res.status(401).send('Credenciales inválidas');

  res.cookie('usuario', username, { httpOnly: false });
  res.send('Inicio de sesión exitoso');
});

app.get('/perfil', (req, res) => {
  const user = req.cookies.usuario;
  if (!user) return res.status(401).send('No autenticado');

  res.send(`Bienvenido ${user}`);
});

app.post('/logout', (req, res) => {
  res.clearCookie('usuario');
  res.send('Sesión cerrada correctamente 👋');
});

app.post('/logout', (req, res) => {
  res.clearCookie('usuario');
  res.redirect('/login.html');
});

const client = new MongoClient(MONGO_URI);

async function conectarDB() {
  try {
    await client.connect();
    console.log('Conectado a MongoDB');
    const db = client.db(DB_NAME);


    global.db = db;
  } catch (err) {
    console.error('Error al conectar a MongoDB:', err);
  }
}

conectarDB();

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
