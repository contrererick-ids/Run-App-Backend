/* eslint-env jest */
import { jest } from '@jest/globals';

// Mocks globales
const mockSave = jest.fn();
const mockFindById = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockFindByIdAndDelete = jest.fn();
const mockFind = jest.fn();
const mockSelect = jest.fn();

// Mock del modelo User
jest.unstable_mockModule('../models/userModel.js', () => {
  const MockUserClass = jest.fn().mockImplementation((data) => ({
    ...data,
    save: mockSave,
    toObject: jest.fn().mockReturnValue(data)
  }));
  
  MockUserClass.findById = mockFindById;
  MockUserClass.findByIdAndUpdate = mockFindByIdAndUpdate;
  MockUserClass.findByIdAndDelete = mockFindByIdAndDelete;
  MockUserClass.find = mockFind;
  
  return { default: MockUserClass };
});

// Mock de Bcrypt
const mockHashSync = jest.fn();
jest.unstable_mockModule('bcryptjs', () => ({
  default: { hashSync: mockHashSync }
}));

// Mock del calculador VDOT
const mockCalculateVdot = jest.fn();
const mockGetTrainingPaces = jest.fn();
jest.unstable_mockModule('../utils/vDotCalculator.js', () => ({
  calculateVdot: mockCalculateVdot,
  getTrainingPaces: mockGetTrainingPaces
}));

// Mock del middleware de error
jest.unstable_mockModule('../middleware/error.js', () => ({
  errorHandler: (code, msg) => ({ statusCode: code, message: msg })
}));

// Imports
const {
  updateUser,
  setVdot,
  updateVdot,
  updateUpcomingRaces,
  updateRecentRaces,
  updatePBs,
  getUser,
  getAllUsers,
  deleteUser,
  pushTrainingPlan
} = await import('./userController.js');

const httpMocks = (await import('node-mocks-http')).default;

let req, res, next;

const mockUserData = {
  _id: 'user_123',
  username: 'runner_pro',
  email: 'runner@test.com',
  password: 'hashed_password',
  avatar: 'avatar.jpg',
  vDot: {
    value: 50,
    trainingPaces: {
      easy: '5:30',
      marathon: '4:45',
      threshold: '4:15',
      interval: '3:45',
      repetition: '3:30'
    },
    calculatedFrom: {
      distance: '5K',
      time: 1200,
      date: '2024-01-15'
    }
  },
  personalBests: {
    fiveK: { time: '20:00', timeInSeconds: 1200, date: '2024-01-15' },
    tenK: { time: '42:00', timeInSeconds: 2520, date: '2024-02-10' },
    halfMarathon: { time: '1:35:00', timeInSeconds: 5700, date: '2024-03-20' },
    marathon: { time: '3:30:00', timeInSeconds: 12600, date: '2024-04-15' }
  },
  upcomingRaces: [],
  recentRaces: [],
  trainingPlan: null
};

beforeEach(() => {
  req = httpMocks.createRequest();
  res = httpMocks.createResponse();
  next = jest.fn();
  jest.clearAllMocks();
  
  // Usuario autenticado por defecto
  req.user = { id: 'user_123' };
  req.params = { id: 'user_123' };
});

describe('User Controller', () => {

  describe('updateUser', () => {
    it('debe bloquear actualización de cuenta ajena (seguridad)', async () => {
      req.user.id = 'other_user';
      req.params.id = 'user_123';

      await updateUser(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('debe actualizar datos básicos sin tocar password', async () => {
      req.body = { username: 'new_name', email: 'new@test.com' };
      const updatedUser = { ...mockUserData, ...req.body };
      
      mockFindByIdAndUpdate.mockResolvedValue({
        toObject: () => updatedUser
      });

      await updateUser(req, res, next);

      expect(mockFindByIdAndUpdate).toHaveBeenCalledWith(
        'user_123',
        expect.objectContaining({ username: 'new_name' }),
        { new: true }
      );
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().username).toBe('new_name');
    });

    it('debe hashear password si se proporciona', async () => {
      req.body = { password: 'new_plain_password' };
      mockHashSync.mockReturnValue('new_hashed_password');
      
      const updatedUser = { ...mockUserData, password: 'new_hashed_password' };
      mockFindByIdAndUpdate.mockResolvedValue({
        toObject: () => updatedUser
      });

      await updateUser(req, res, next);

      expect(mockHashSync).toHaveBeenCalledWith('new_plain_password', 10);
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().password).toBeUndefined();
    });

    it('debe manejar errores de BD durante actualización', async () => {
      req.body = { username: 'fail_update' };
      const dbError = new Error('Database connection lost');
      mockFindByIdAndUpdate.mockRejectedValue(dbError);

      await updateUser(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  describe('setVdot', () => {
    it('debe bloquear actualización de VDOT de otro usuario', async () => {
      req.user.id = 'other_user';

      await setVdot(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('debe fallar si el usuario no existe', async () => {
      mockFindById.mockResolvedValue(null);

      await setVdot(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: 'User not found' })
      );
    });

    it('debe establecer VDOT manual y calcular paces', async () => {
      req.body = { manualVdot: 55 };
      const mockPaces = {
        easy: '5:15',
        marathon: '4:30',
        threshold: '4:00',
        interval: '3:30',
        repetition: '3:15'
      };
      
      const user = { ...mockUserData, save: mockSave, toObject: () => mockUserData };
      mockFindById.mockResolvedValue(user);
      mockGetTrainingPaces.mockReturnValue(mockPaces);
      mockSave.mockResolvedValue(user);

      await setVdot(req, res, next);

      expect(mockGetTrainingPaces).toHaveBeenCalledWith(55);
      expect(mockSave).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().message).toBe('VDOT updated successfully');
    });

    it('debe calcular VDOT desde personal best', async () => {
      req.body = {
        personalBests: {
          distance: '5K',
          time: 1200,
          date: '2024-06-01'
        }
      };
      
      const user = { ...mockUserData, save: mockSave, toObject: () => mockUserData };
      mockFindById.mockResolvedValue(user);
      mockCalculateVdot.mockReturnValue(52);
      mockGetTrainingPaces.mockReturnValue({
        easy: '5:20',
        marathon: '4:35',
        threshold: '4:10',
        interval: '3:40',
        repetition: '3:20'
      });

      await setVdot(req, res, next);

      expect(mockCalculateVdot).toHaveBeenCalledWith('5K', 1200);
      expect(mockSave).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('debe fallar si falta distancia, tiempo o fecha en personal best', async () => {
      req.body = { personalBests: { distance: '5K' } }; // Falta time y date
      
      const user = { ...mockUserData };
      mockFindById.mockResolvedValue(user);

      await setVdot(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Distance, time, and date are required for personal bests'
        })
      );
    });

    it('debe fallar si time no es un número', async () => {
      req.body = {
        personalBests: {
          distance: '5K',
          time: '20:00', // String en lugar de número
          date: '2024-06-01'
        }
      };
      
      const user = { ...mockUserData };
      mockFindById.mockResolvedValue(user);

      await setVdot(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Time must be provided in seconds'
        })
      );
    });
  });

  // -------------------------------------------------------------------
  // UPDATE VDOT TESTS
  // -------------------------------------------------------------------
  describe('updateVdot', () => {
    it('debe actualizar solo el valor VDOT y recalcular paces', async () => {
      req.body = { vDot: 60 };
      const mockPaces = {
        easy: '5:00',
        marathon: '4:15',
        threshold: '3:50',
        interval: '3:20',
        repetition: '3:00'
      };
      
      const user = { ...mockUserData, save: mockSave, toObject: () => mockUserData };
      mockFindById.mockResolvedValue(user);
      mockGetTrainingPaces.mockReturnValue(mockPaces);

      await updateVdot(req, res, next);

      expect(mockGetTrainingPaces).toHaveBeenCalledWith(60);
      expect(res.statusCode).toBe(200);
    });

    it('debe fallar si no se proporciona vDot', async () => {
      req.body = {};
      const user = { ...mockUserData };
      mockFindById.mockResolvedValue(user);

      await updateVdot(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'VDOT is required' })
      );
    });

    it('debe fallar si usuario no existe', async () => {
      req.body = { vDot: 50 };
      mockFindById.mockResolvedValue(null);

      await updateVdot(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('debe fallar si usuario intenta actualizar otro id que no es el suyo', async () => {
      req.user.id = 'other_user';
      req.params.id = 'user_123';
      req.body = { vDot: 55 };

      await updateVdot(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });
  });

  describe('updateUpcomingRaces', () => {
    it('debe agregar carrera próxima al array del usuario', async () => {
      req.body = {
        name: 'Boston Marathon',
        date: '2025-04-21',
        projectedTime: '3:15:00'
      };
      
      const user = {
        ...mockUserData,
        upcomingRaces: [],
        save: mockSave,
        toObject: () => ({ ...mockUserData, upcomingRaces: [req.body] })
      };
      mockFindById.mockResolvedValue(user);

      await updateUpcomingRaces(req, res, next);

      expect(user.upcomingRaces).toHaveLength(1);
      expect(mockSave).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('debe fallar si faltan campos requeridos', async () => {
      req.body = { name: 'Incomplete Race' }; // Faltan date y projectedTime
      const user = { ...mockUserData };
      mockFindById.mockResolvedValue(user);

      await updateUpcomingRaces(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'All fields are required' })
      );
    });

    it('debe fallar si usuario intenta actualizar otro id que no es el suyo', async () => {
      req.user.id = 'other_user';
      req.params.id = 'user_123';
      req.body = { vDot: 55 };

      await updateUpcomingRaces(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('debe fallar si usuario no existe', async () => {
      req.body = {
        name: 'Itzatapalapa 5K',
        location: 'Park',
        distance: '5K',
        time: '20:00',
        timeInSeconds: 1200,
        date: '2024-12-01'
      };
      mockFindById.mockResolvedValue(null);

      await updateUpcomingRaces(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('updateRecentRaces', () => {
    it('debe agregar carrera reciente con todos los datos', async () => {
      req.body = {
        name: 'City 10K',
        location: 'Downtown',
        distance: '10K',
        time: '42:30',
        timeInSeconds: 2550,
        date: '2024-11-15'
      };
      
      const user = {
        ...mockUserData,
        recentRaces: [],
        save: mockSave,
        toObject: () => ({ ...mockUserData, recentRaces: [req.body] })
      };
      mockFindById.mockResolvedValue(user);

      await updateRecentRaces(req, res, next);

      expect(user.recentRaces).toHaveLength(1);
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().message).toBe('recentRaces updated successfully');
    });

    it('debe fallar si falta algún campo obligatorio', async () => {
      req.body = {
        name: 'Incomplete',
        location: 'City'
        // Faltan distance, time, timeInSeconds, date
      };
      const user = { ...mockUserData };
      mockFindById.mockResolvedValue(user);

      await updateRecentRaces(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it('debe fallar si usuario intenta actualizar otro id que no es el suyo', async () => {
      req.user.id = 'other_user';
      req.params.id = 'user_123';
      req.body = { vDot: 55 };

      await updateRecentRaces(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });
    
    it('debe fallar si usuario no existe', async () => {
      req.body = {
        name: 'Test Race',
        location: 'Park',
        distance: '5K',
        time: '20:00',
        timeInSeconds: 1200,
        date: '2024-12-01'
      };
      mockFindById.mockResolvedValue(null);

      await updateRecentRaces(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('updatePBs', () => {
    it('debe actualizar múltiples personal bests', async () => {
      req.body = {
        personalBests: {
          fiveK: { time: '19:30', date: '2024-12-01' },
          tenK: { time: '41:00', date: '2024-11-15' }
        }
      };
      
      const user = {
        ...mockUserData,
        save: mockSave,
        toObject: () => mockUserData
      };
      mockFindById.mockResolvedValue(user);

      await updatePBs(req, res, next);

      expect(mockSave).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().message).toBe('Personal bests updated successfully');
    });

    it('debe convertir formato de tiempo HH:MM:SS a segundos', async () => {
      req.body = {
        personalBests: {
          marathon: { time: '03:25:30', date: '2024-10-15' }
        }
      };
      
      const user = {
        ...mockUserData,
        personalBests: { ...mockUserData.personalBests },
        save: mockSave,
        toObject: () => mockUserData
      };
      mockFindById.mockResolvedValue(user);

      await updatePBs(req, res, next);

      const expectedSeconds = 3 * 3600 + 25 * 60 + 30; 
      expect(user.personalBests.marathon.timeInSeconds).toBe(expectedSeconds);
    });

    it('debe rechazar formato de tiempo inválido', async () => {
      req.body = {
        personalBests: {
          fiveK: { time: '25:99', date: '2024-12-01' } 
        }
      };
      
      const user = { ...mockUserData };
      mockFindById.mockResolvedValue(user);

      await updatePBs(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('Invalid time format')
        })
      );
    });
  });

  describe('getUser', () => {
    it('debe retornar usuario sin password', async () => {
      mockFindById.mockReturnValue({
        select: mockSelect.mockResolvedValue(mockUserData)
      });

      await getUser(req, res, next);

      expect(mockFindById).toHaveBeenCalledWith('user_123');
      expect(mockSelect).toHaveBeenCalledWith('-password');
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toEqual(mockUserData);
    });

    it('debe fallar si usuario no existe', async () => {
      mockFindById.mockReturnValue({
        select: mockSelect.mockResolvedValue(null)
      });

      await getUser(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: 'User not found' })
      );
    });

    it('debe manejar errores de BD', async () => {
      const dbError = new Error('Query failed');
      mockFindById.mockImplementation(() => {
        throw dbError;
      });

      await getUser(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });

  describe('getAllUsers', () => {
    it('debe retornar todos los usuarios sin passwords', async () => {
      const users = [mockUserData, { ...mockUserData, _id: 'user_456' }];
      mockFind.mockReturnValue({
        select: mockSelect.mockResolvedValue(users)
      });

      await getAllUsers(req, res, next);

      expect(mockFind).toHaveBeenCalledWith({});
      expect(mockSelect).toHaveBeenCalledWith('-password');
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData()).toHaveLength(2);
    });

    it('debe fallar si no hay usuarios', async () => {
      mockFind.mockReturnValue({
        select: mockSelect.mockResolvedValue(null)
      });

      await getAllUsers(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: 'No users found' })
      );
    });
  });

  describe('deleteUser', () => {
    it('debe bloquear eliminación de cuenta ajena', async () => {
      req.user.id = 'other_user';

      await deleteUser(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('debe eliminar usuario y retornar confirmación', async () => {
      mockFindByIdAndDelete.mockResolvedValue(mockUserData);

      await deleteUser(req, res, next);

      expect(mockFindByIdAndDelete).toHaveBeenCalledWith('user_123');
      expect(res.statusCode).toBe(200);
      expect(res._getJSONData().message).toBe('User deleted successfully');
      expect(res._getJSONData().user.id).toBe('user_123');
    });

    it('debe fallar si usuario no existe', async () => {
      mockFindByIdAndDelete.mockResolvedValue(null);

      await deleteUser(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('pushTrainingPlan', () => {
  it('debe actualizar plan de entrenamiento', async () => {
    const trainingPlan = {
      name: '12-Week Marathon',
      weeks: 12,
      targetRace: 'Marathon'
    };
    req.body = { TrainingPlan: trainingPlan };
    
    const user = {
      ...mockUserData,
      trainingPlan: null,
      save: mockSave, 
      toObject: jest.fn().mockReturnValue({ ...mockUserData, trainingPlan })
    };
    mockFindById.mockResolvedValue(user);
    mockSave.mockResolvedValue(user); 

    await pushTrainingPlan(req, res, next);

    expect(user.trainingPlan).toEqual(trainingPlan);
    expect(mockSave).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('debe fallar si no se proporciona TrainingPlan', async () => {
    req.body = {};

    const result = await pushTrainingPlan(req, res, next);

    expect(result).toEqual(
      expect.objectContaining({ statusCode: 400, message: 'TrainingPlan is required' })
    );
  });

  it('debe fallar si usuario no existe', async () => {
    req.body = { TrainingPlan: { name: 'Plan' } };
    mockFindById.mockResolvedValue(null);

    await pushTrainingPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 })
    );
  });

  it('debe manejar errores durante actualización de plan', async () => {
    req.body = { TrainingPlan: { name: 'Plan' } };
    
    const user = {
      ...mockUserData,
      trainingPlan: null,
      save: mockSave, 
      toObject: jest.fn().mockReturnValue(mockUserData)
    };
    
    mockFindById.mockResolvedValue(user);
    const saveError = new Error('Save failed');
    mockSave.mockRejectedValue(saveError); 

    await pushTrainingPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(saveError);
    });
 });
});