import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getWeeklySummary,
  createWorkout,
  getAllWorkouts,
  getWorkoutById,
  updateWorkout,
  deleteWorkout,
  addToTrainingPlan,
  getTrainingPlans,
  getTrainingPlanById,
  updateTrainingPlan,
  deleteTrainingPlan,
  completeWorkout
} from '../controllers/trainingController.js';
import Workout from '../models/workoutModel.js';
import TrainingPlan from '../models/planModel.js';
import User from '../models/userModel.js';
import { createWorkoutSchema, addToTrainingPlanSchema } from '../validations/workoutValidation.js';

// Mock de los modelos
vi.mock('../models/workoutModel.js');
vi.mock('../models/planModel.js');
vi.mock('../models/userModel.js');
vi.mock('../validations/workoutValidation.js');

describe('Training Controller Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {}
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getWeeklySummary', () => {
    it('debe retornar el resumen semanal para un usuario válido', async () => {
      req.params.user = 'user123';
      
      const mockUser = { _id: 'user123', username: 'testuser' };
      const mockPlans = [
        {
          user: 'user123',
          date: new Date(),
          totalDistance: 10,
          completedDistance: 5,
          workouts: [
            { day: 'Monday', completed: true, workout: {} },
            { day: 'Tuesday', completed: false, workout: {} }
          ]
        }
      ];

      User.findById.mockResolvedValue(mockUser);
      TrainingPlan.find.mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockPlans)
      });

      await getWeeklySummary(req, res, next);

      expect(User.findById).toHaveBeenCalledWith('user123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          totalPlannedDistance: expect.any(Number),
          totalCompletedDistance: expect.any(Number),
          workoutsPlanned: expect.any(Number),
          workoutsCompleted: expect.any(Number)
        })
      });
    });

    it('debe retornar error 404 si el usuario no existe', async () => {
      req.params.user = 'invalidUser';
      User.findById.mockResolvedValue(null);

      await getWeeklySummary(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('createWorkout', () => {
    it('debe crear un workout exitosamente', async () => {
      const workoutData = {
        workoutName: 'Test Workout',
        warmUp: { distance: 2, unit: 'km' },
        work: [{ distance: 5, pace: '4:30', unit: 'km' }],
        coolDown: { distance: 1, unit: 'km' },
        user: 'user123',
        isTemplate: false
      };

      req.body = workoutData;

      const mockUser = { _id: 'user123', vdot: { value: 50 } };
      const mockWorkout = { _id: 'workout123', ...workoutData };

      createWorkoutSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue(mockUser);
      Workout.create.mockResolvedValue(mockWorkout);
      User.findByIdAndUpdate.mockResolvedValue(mockUser);

      await createWorkout(req, res, next);

      expect(Workout.create).toHaveBeenCalledWith(workoutData);
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user123', {
        $push: { workouts: 'workout123' }
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Workout created successfully',
        data: mockWorkout
      });
    });

    it('debe retornar error 400 si la validación falla', async () => {
      req.body = { workoutName: '' };
      
      createWorkoutSchema.validate.mockReturnValue({
        error: { details: [{ message: 'Workout name is required' }] }
      });

      await createWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it('debe retornar error 404 si el usuario no existe', async () => {
      req.body = {
        workoutName: 'Test',
        user: 'invalidUser'
      };

      createWorkoutSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue(null);

      await createWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('debe retornar error 400 si se intenta usar pace sin Vdot', async () => {
      req.body = {
        workoutName: 'Test',
        warmUp: { pace: '5:00' },
        user: 'user123'
      };

      createWorkoutSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue({ _id: 'user123', vdot: null });

      await createWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('getAllWorkouts', () => {
    it('debe retornar todos los workouts de un usuario', async () => {
      req.params.user = 'user123';
      
      const mockWorkouts = [
        { _id: 'w1', workoutName: 'Workout 1' },
        { _id: 'w2', workoutName: 'Workout 2' }
      ];

      User.findById.mockResolvedValue({ _id: 'user123' });
      Workout.find.mockResolvedValue(mockWorkouts);

      await getAllWorkouts(req, res, next);

      expect(Workout.find).toHaveBeenCalledWith({ user: 'user123' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockWorkouts
      });
    });

    it('debe retornar error 400 si no se proporciona usuario', async () => {
      req.params.user = undefined;

      await getAllWorkouts(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });
  });

  describe('getWorkoutById', () => {
    it('debe retornar un workout por ID', async () => {
      req.params = { id: 'workout123', user: 'user123' };
      
      const mockWorkout = {
        _id: 'workout123',
        workoutName: 'Test Workout',
        user: 'user123'
      };

      Workout.findOne.mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockWorkout)
      });

      await getWorkoutById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockWorkout
      });
    });

    it('debe retornar error 404 si el workout no existe', async () => {
      req.params = { id: 'invalid', user: 'user123' };

      Workout.findOne.mockReturnValue({
        populate: vi.fn().mockResolvedValue(null)
      });

      await getWorkoutById(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('updateWorkout', () => {
    it('debe actualizar un workout exitosamente', async () => {
      req.params = { id: 'workout123', user: 'user123' };
      req.body = { workoutName: 'Updated Workout' };

      const mockUser = { _id: 'user123', vdot: { value: 50 } };
      const mockWorkout = { _id: 'workout123', user: 'user123' };
      const mockUpdatedWorkout = { ...mockWorkout, ...req.body };

      User.findById.mockResolvedValue(mockUser);
      Workout.findOne.mockResolvedValue(mockWorkout);
      Workout.findByIdAndUpdate.mockResolvedValue(mockUpdatedWorkout);

      await updateWorkout(req, res, next);

      expect(Workout.findByIdAndUpdate).toHaveBeenCalledWith(
        'workout123',
        req.body,
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe retornar error 404 si el workout no existe', async () => {
      req.params = { id: 'invalid', user: 'user123' };

      User.findById.mockResolvedValue({ _id: 'user123' });
      Workout.findOne.mockResolvedValue(null);

      await updateWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('deleteWorkout', () => {
    it('debe eliminar un workout exitosamente', async () => {
      req.params = { id: 'workout123', user: 'user123' };

      const mockUser = { _id: 'user123' };
      const mockWorkout = { _id: 'workout123', user: 'user123' };

      User.findById.mockResolvedValue(mockUser);
      Workout.findOne.mockResolvedValue(mockWorkout);
      Workout.findByIdAndDelete.mockResolvedValue(mockWorkout);

      await deleteWorkout(req, res, next);

      expect(Workout.findByIdAndDelete).toHaveBeenCalledWith('workout123');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Workout deleted successfully',
        data: {}
      });
    });
  });

  describe('addToTrainingPlan', () => {
    it('debe crear un plan de entrenamiento exitosamente', async () => {
      const planData = {
        date: new Date(),
        week: 1,
        workouts: [
          { workout: 'w1', day: 'Monday' },
          { workout: 'w2', day: 'Tuesday' }
        ],
        user: 'user123'
      };

      req.body = planData;

      const mockUser = { _id: 'user123' };
      const mockWorkout = { _id: 'w1', totalDistance: 5 };
      const mockPlan = { _id: 'plan123', ...planData };

      addToTrainingPlanSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue(mockUser);
      Workout.findById.mockResolvedValue(mockWorkout);
      TrainingPlan.create.mockResolvedValue(mockPlan);
      User.findByIdAndUpdate.mockResolvedValue(mockUser);
      TrainingPlan.findById.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        populate: vi.fn().mockResolvedValue(mockPlan)
      });

      await addToTrainingPlan(req, res, next);

      expect(TrainingPlan.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('debe retornar error 400 si hay días duplicados', async () => {
      req.body = {
        date: new Date(),
        week: 1,
        workouts: [
          { workout: 'w1', day: 'Monday' },
          { workout: 'w2', day: 'Monday' }
        ],
        user: 'user123'
      };

      addToTrainingPlanSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue({ _id: 'user123' });
      Workout.findById.mockResolvedValue({ _id: 'w1' });

      await addToTrainingPlan(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it('debe retornar error 404 si un workout no existe', async () => {
      req.body = {
        date: new Date(),
        week: 1,
        workouts: [{ workout: 'invalid', day: 'Monday' }],
        user: 'user123'
      };

      addToTrainingPlanSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue({ _id: 'user123' });
      Workout.findById.mockResolvedValue(null);

      await addToTrainingPlan(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('getTrainingPlans', () => {
    it('debe retornar todos los planes de entrenamiento', async () => {
      req.params.user = 'user123';
      
      const mockPlans = [
        { _id: 'plan1', date: new Date(), workouts: [] },
        { _id: 'plan2', date: new Date(), workouts: [] }
      ];

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.find.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue(mockPlans)
      });

      await getTrainingPlans(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockPlans,
        weeklySummaries: expect.any(Array)
      });
    });

    it('debe filtrar por rango de fechas si se proporciona', async () => {
      req.params.user = 'user123';
      req.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.find.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockResolvedValue([])
      });

      await getTrainingPlans(req, res, next);

      expect(TrainingPlan.find).toHaveBeenCalledWith({
        user: 'user123',
        date: {
          $gte: expect.any(Date),
          $lte: expect.any(Date)
        }
      });
    });
  });

  describe('getTrainingPlanById', () => {
    it('debe retornar un plan de entrenamiento por ID', async () => {
      req.params = { id: 'plan123', user: 'user123' };
      
      const mockPlan = { _id: 'plan123', workouts: [] };

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.findOne.mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockPlan)
      });

      await getTrainingPlanById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockPlan
      });
    });
  });

  describe('updateTrainingPlan', () => {
    it('debe actualizar un plan de entrenamiento', async () => {
      req.params = { id: 'plan123', user: 'user123' };
      req.body = { week: 2 };

      const mockPlan = { _id: 'plan123', totalDistance: 10 };

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.findOne.mockResolvedValue(mockPlan);
      TrainingPlan.findByIdAndUpdate.mockReturnValue({
        populate: vi.fn().mockResolvedValue({ ...mockPlan, week: 2 })
      });

      await updateTrainingPlan(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('debe recalcular distancia si se actualizan workouts', async () => {
      req.params = { id: 'plan123', user: 'user123' };
      req.body = {
        workouts: [{ workout: 'w1', day: 'Monday' }]
      };

      const mockPlan = { _id: 'plan123', totalDistance: 10 };
      const mockWorkout = { _id: 'w1', totalDistance: 5 };

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.findOne.mockResolvedValue(mockPlan);
      Workout.findById.mockResolvedValue(mockWorkout);
      TrainingPlan.findByIdAndUpdate.mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockPlan)
      });

      await updateTrainingPlan(req, res, next);

      expect(Workout.findById).toHaveBeenCalledWith('w1');
    });
  });

  describe('deleteTrainingPlan', () => {
    it('debe eliminar un plan de entrenamiento', async () => {
      req.params = { id: 'plan123', user: 'user123' };

      const mockPlan = { _id: 'plan123' };

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.findOne.mockResolvedValue(mockPlan);
      TrainingPlan.findByIdAndDelete.mockResolvedValue(mockPlan);

      await deleteTrainingPlan(req, res, next);

      expect(TrainingPlan.findByIdAndDelete).toHaveBeenCalledWith('plan123');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('completeWorkout', () => {
    it('debe marcar un workout como completado', async () => {
      req.params.user = 'user123';
      req.body = {
        planId: 'plan123',
        workoutId: 'w1',
        actualDistance: 5.5,
        notes: 'Great run!'
      };

      const mockPlan = {
        _id: 'plan123',
        workouts: [
          { workout: 'w1', completed: false },
          { workout: 'w2', completed: false }
        ],
        save: vi.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.findOne.mockResolvedValue(mockPlan);
      TrainingPlan.findById.mockReturnValue({
        populate: vi.fn().mockResolvedValue({
          ...mockPlan,
          workouts: [
            {
              workout: 'w1',
              completed: true,
              actualDistance: 5.5,
              notes: 'Great run!'
            }
          ]
        })
      });

      await completeWorkout(req, res, next);

      expect(mockPlan.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Workout marked as complete',
        data: expect.any(Object)
      });
    });

    it('debe retornar error 400 si faltan campos requeridos', async () => {
      req.params.user = 'user123';
      req.body = { planId: 'plan123' }; // falta workoutId

      await completeWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it('debe retornar error 404 si el workout no está en el plan', async () => {
      req.params.user = 'user123';
      req.body = {
        planId: 'plan123',
        workoutId: 'invalid'
      };

      const mockPlan = {
        _id: 'plan123',
        workouts: [{ workout: 'w1', completed: false }]
      };

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.findOne.mockResolvedValue(mockPlan);

      await completeWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404 })
      );
    });

    it('debe actualizar completedDistance correctamente', async () => {
      req.params.user = 'user123';
      req.body = {
        planId: 'plan123',
        workoutId: 'w1',
        actualDistance: 10
      };

      const mockPlan = {
        _id: 'plan123',
        workouts: [
          { workout: 'w1', completed: false },
          { workout: 'w2', completed: true, actualDistance: 5 }
        ],
        completedDistance: 5,
        save: vi.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue({ _id: 'user123' });
      TrainingPlan.findOne.mockResolvedValue(mockPlan);
      TrainingPlan.findById.mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockPlan)
      });

      await completeWorkout(req, res, next);

      expect(mockPlan.completedDistance).toBe(15); // 5 + 10
    });
  });
});
