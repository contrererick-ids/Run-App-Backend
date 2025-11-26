import { jest } from '@jest/globals';

// =====================================================================
// MOCK SETUP
// Configuración de mocks antes de importar el controlador (requerido por ESM)
// =====================================================================

const mockSave = jest.fn();
const mockFindOne = jest.fn();

// Mock de Mongoose: Simulamos que 'User' es una clase constructora
// para interceptar 'new User()' y sus métodos de instancia (.save)
jest.unstable_mockModule('../models/userModel.js', () => {
  const MockUserClass = jest.fn().mockImplementation((data) => ({
    ...data,
    save: mockSave,
    toObject: jest.fn().mockReturnValue(data)
  }));
  
  // Métodos estáticos
  MockUserClass.findOne = mockFindOne;
  
  return { default: MockUserClass };
});

// Mock de Bcrypt y JWT para evitar criptografía real en tests
const mockHashSync = jest.fn();
const mockCompareSync = jest.fn();
const mockSign = jest.fn();

jest.unstable_mockModule('bcryptjs', () => ({
  default: { hashSync: mockHashSync, compareSync: mockCompareSync }
}));

jest.unstable_mockModule('jsonwebtoken', () => ({
  default: { sign: mockSign }
}));

// Mock del Middleware de Error
jest.unstable_mockModule('../middleware/error.js', () => ({
  errorHandler: (code, msg) => ({ statusCode: code, message: msg })
}));

// =====================================================================
// IMPORTS & TEST SUITE
// =====================================================================

const { signUp, signIn, google, signOut } = await import('./authController.js');
const httpMocks = (await import('node-mocks-http')).default;

let req, res, next;

// Datos semilla para reutilizar
const mockUserData = {
  _id: 'user_123',
  username: 'dev_user',
  email: 'dev@test.com',
  password: 'hashed_password',
  role: 'user',
  avatar: 'avatar.jpg'
};

beforeEach(() => {
  req = httpMocks.createRequest();
  res = httpMocks.createResponse();
  next = jest.fn();
  jest.clearAllMocks();
  process.env.JWT_SECRET = 'test_secret';
});

describe('Auth Controller', () => {

  // -------------------------------------------------------------------
  // SIGN UP TESTS
  // -------------------------------------------------------------------
  describe('signUp', () => {
    // Seguridad: Evitar que alguien se asigne roles privilegiados
    it('debe bloquear roles no permitidos (security check)', async () => {
      req.body = { ...mockUserData, role: 'admin_hack' };
      
      await signUp(req, res, next);
      
      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().message).toMatch(/Invalid role/);
    });

    // Happy Path: Flujo ideal de registro
    it('debe registrar usuario, hashear password y retornar 201', async () => {
      req.body = { ...mockUserData, password: 'plain_password' };
      mockHashSync.mockReturnValue('hashed_secret');
      mockSave.mockResolvedValue(mockUserData);

      await signUp(req, res, next);

      expect(mockHashSync).toHaveBeenCalled(); // Verifica encriptación
      expect(mockSave).toHaveBeenCalled();     // Verifica persistencia
      expect(res.statusCode).toBe(201);
      expect(res._getJSONData().success).toBe(true);
    });

    // Manejo de errores de negocio (ej. email duplicado)
    it('debe capturar errores de validación de Mongoose', async () => {
      req.body = { ...mockUserData };
      // Simulamos error nativo de Mongo/Mongoose
      const validationError = {
        name: 'ValidationError',
        errors: { email: { message: 'Email already exists' } }
      };
      mockSave.mockRejectedValue(validationError);

      await signUp(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res._getJSONData().message).toBe('Email already exists');
    });

    // Robustez: Caída de BD
    it('debe pasar errores inesperados al middleware global', async () => {
      req.body = { ...mockUserData };
      const crashError = new Error('DB Connection Lost');
      mockSave.mockRejectedValue(crashError);

      await signUp(req, res, next);

      expect(next).toHaveBeenCalledWith(crashError);
    });
  });

  // -------------------------------------------------------------------
  // SIGN IN TESTS
  // -------------------------------------------------------------------
  describe('signIn', () => {
    // Validación de existencia
    it('debe fallar (404) si el email no existe', async () => {
      req.body = { email: 'ghost@user.com' };
      mockFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

      await signIn(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    // Seguridad: Validación de credenciales
    it('debe fallar (401) con contraseña incorrecta', async () => {
      req.body = { email: 'dev@test.com', password: 'wrong' };
      const user = { ...mockUserData };
      
      mockFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
      mockCompareSync.mockReturnValue(false); // Password mismatch

      await signIn(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });

    // Happy Path: Login y emisión de token
    it('debe autenticar correctamente y setear cookie HTTP-Only', async () => {
      req.body = { email: mockUserData.email, password: 'correct' };
      const userInstance = { ...mockUserData, toObject: () => mockUserData };
      
      mockFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(userInstance) });
      mockCompareSync.mockReturnValue(true);
      mockSign.mockReturnValue('jwt_token_valid');

      await signIn(req, res, next);

      expect(res.statusCode).toBe(200);
      expect(res.cookies['access_token'].value).toBe('jwt_token_valid'); // Cookie presente
      expect(res._getJSONData().jwt).toBe('jwt_token_valid');
    });

    // Manejo de errores en Login
    it('debe manejar errores de BD durante el login', async () => {
      req.body = { email: 'dev@test.com' };
      mockFindOne.mockImplementation(() => { throw new Error('Query failed') });

      await signIn(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // -------------------------------------------------------------------
  // GOOGLE AUTH TESTS
  // -------------------------------------------------------------------
  describe('googleAuth', () => {
    // Caso: Usuario nuevo (Registro automático)
    it('debe crear usuario nuevo si no existe en BD', async () => {
      req.body = { email: 'new@google.com', name: 'New G-User', photo: 'pic.png' };
      
      mockFindOne.mockResolvedValue(null);    // No encontrado
      mockSave.mockResolvedValue({});         // Éxito al guardar
      mockHashSync.mockReturnValue('gen_pass');
      mockSign.mockReturnValue('new_token');

      await google(req, res, next);

      expect(mockSave).toHaveBeenCalled();    // Se creó el registro
      expect(res.statusCode).toBe(200);
    });

    // Caso: Usuario existente (Login)
    it('debe loguear usuario existente sin crear registro duplicado', async () => {
      req.body = { email: 'exist@google.com' };
      const user = { ...mockUserData, toObject: () => mockUserData };
      
      mockFindOne.mockResolvedValue(user);    // Encontrado
      mockSign.mockReturnValue('exist_token');

      await google(req, res, next);

      expect(mockSave).not.toHaveBeenCalled(); // No debe guardar nada
      expect(res.statusCode).toBe(200);
      expect(res.cookies['access_token'].value).toBe('exist_token');
    });

    // Fallos en autenticación social
    it('debe manejar fallos en la estrategia de Google', async () => {
      req.body = { email: 'fail@google.com' };
      mockFindOne.mockRejectedValue(new Error('Google Auth Failed'));

      await google(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  // -------------------------------------------------------------------
  // SIGN OUT TESTS
  // -------------------------------------------------------------------
  describe('signOut', () => {
    // Limpieza de sesión
    it('debe limpiar la cookie de sesión', async () => {
      await signOut(req, res, next);
      
      expect(res.cookies['access_token'].value).toBeFalsy(); // Valor vacío o expirado
      expect(res.statusCode).toBe(200);
    });

    // Error inesperado al limpiar cookies
    it('debe capturar errores al limpiar cookies', async () => {
      // Mock forzado para provocar error en res.clearCookie
      res.clearCookie = jest.fn(() => { throw new Error('Cookie Error') });

      await signOut(req, res, next);
      
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});