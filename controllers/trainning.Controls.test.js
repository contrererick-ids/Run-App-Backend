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
jest.mock('../models/workoutModel.js');
jest.mock('../models/planModel.js');
jest.mock('../models/userModel.js');
jest.mock('../validations/workoutValidation.js');

describe('Training Controller Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {}
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('getWeeklySummary', () => {
    it('should return weekly summary successfully', async () => {
      const userId = '123';
      req.params.user = userId;

      const mockUser = { _id: userId, username: 'testuser' };
      const mockPlans = [
        {
          user: userId,
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
        populate: jest.fn().mockResolvedValue(mockPlans)
      });

      await getWeeklySummary(req, res, next);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          totalPlannedDistance: expect.any(Number),
          totalCompletedDistance: expect.any(Number),
          workoutsPlanned: expect.any(Number),
          workoutsCompleted: expect.any(Number),
          days: expect.any(Object)
        })
      });
    });

    it('should return 404 if user not found', async () => {
      req.params.user = '123';
      User.findById.mockResolvedValue(null);

      await getWeeklySummary(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 404,
        message: 'User not found'
      }));
    });
  });

  describe('createWorkout', () => {
    it('should create a workout successfully', async () => {
      const workoutData = {
        workoutName: 'Morning Run',
        warmUp: { distance: 1, pace: 'easy' },
        work: [{ distance: 5, pace: 'tempo' }],
        coolDown: { distance: 1, pace: 'easy' },
        user: '123',
        isTemplate: false
      };

      req.body = workoutData;

      const mockUser = { _id: '123', vdot: { value: 50 } };
      const mockWorkout = { _id: 'workout123', ...workoutData };

      createWorkoutSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue(mockUser);
      Workout.create.mockResolvedValue(mockWorkout);
      User.findByIdAndUpdate.mockResolvedValue(mockUser);

      await createWorkout(req, res, next);

      expect(Workout.create).toHaveBeenCalledWith(expect.objectContaining({
        workoutName: 'Morning Run',
        user: '123'
      }));
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith('123', {
        $push: { workouts: 'workout123' }
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Workout created successfully',
        data: mockWorkout
      });
    });

    it('should return 400 if validation fails', async () => {
      req.body = { workoutName: '' };
      createWorkoutSchema.validate.mockReturnValue({
        error: { details: [{ message: 'Workout name is required' }] }
      });

      await createWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400,
        message: 'Workout name is required'
      }));
    });

    it('should return 404 if user not found', async () => {
      req.body = { workoutName: 'Test', user: '123' };
      createWorkoutSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue(null);

      await createWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 404,
        message: 'User not found'
      }));
    });

    it('should return 400 if pace set without Vdot', async () => {
      req.body = {
        workoutName: 'Test',
        warmUp: { pace: 'easy' },
        user: '123'
      };
      createWorkoutSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue({ _id: '123', vdot: null });

      await createWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400,
        message: 'User must have a Vdot value to set paces'
      }));
    });
  });

  describe('getAllWorkouts', () => {
    it('should get all workouts for a user', async () => {
      req.params.user = '123';
      const mockWorkouts = [
        { _id: '1', workoutName: 'Workout 1' },
        { _id: '2', workoutName: 'Workout 2' }
      ];

      User.findById.mockResolvedValue({ _id: '123' });
      Workout.find.mockResolvedValue(mockWorkouts);

      await getAllWorkouts(req, res, next);

      expect(Workout.find).toHaveBeenCalledWith({ user: '123' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        data: mockWorkouts
      });
    });

    it('should return 400 if user not provided', async () => {
      req.params = {};

      await getAllWorkouts(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400,
        message: 'User is required'
      }));
    });
  });

  describe('getWorkoutById', () => {
    it('should get a workout by id', async () => {
      req.params = { id: 'workout123', user: '123' };
      const mockWorkout = {
        _id: 'workout123',
        workoutName: 'Test Workout',
        user: '123'
      };

      Workout.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockWorkout)
      });

      await getWorkoutById(req, res, next);

      expect(Workout.findOne).toHaveBeenCalledWith({
        _id: 'workout123',
        user: '123'
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockWorkout
      });
    });

    it('should return 404 if workout not found', async () => {
      req.params = { id: 'workout123', user: '123' };

      Workout.findOne.mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      await getWorkoutById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 404,
        message: 'Workout not found'
      }));
    });
  });

  describe('updateWorkout', () => {
    it('should update a workout successfully', async () => {
      req.params = { id: 'workout123', user: '123' };
      req.body = { workoutName: 'Updated Workout' };

      const mockUser = { _id: '123', vdot: { value: 50 } };
      const mockWorkout = { _id: 'workout123', user: '123' };
      const updatedWorkout = { ...mockWorkout, workoutName: 'Updated Workout' };

      User.findById.mockResolvedValue(mockUser);
      Workout.findOne.mockResolvedValue(mockWorkout);
      Workout.findByIdAndUpdate.mockResolvedValue(updatedWorkout);

      await updateWorkout(req, res, next);

      expect(Workout.findByIdAndUpdate).toHaveBeenCalledWith(
        'workout123',
        { workoutName: 'Updated Workout' },
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Workout updated successfully',
        data: updatedWorkout
      });
    });

    it('should return 404 if workout not found', async () => {
      req.params = { id: 'workout123', user: '123' };
      req.body = { workoutName: 'Updated' };

      User.findById.mockResolvedValue({ _id: '123' });
      Workout.findOne.mockResolvedValue(null);

      await updateWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 404,
        message: 'Workout not found or unauthorized'
      }));
    });
  });

  describe('deleteWorkout', () => {
    it('should delete a workout successfully', async () => {
      req.params = { id: 'workout123', user: '123' };

      const mockUser = { _id: '123' };
      const mockWorkout = { _id: 'workout123', user: '123' };

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
    it('should create a training plan successfully', async () => {
      req.body = {
        date: new Date(),
        week: 1,
        workouts: [
          { workout: 'workout1', day: 'Monday' },
          { workout: 'workout2', day: 'Tuesday' }
        ],
        user: '123'
      };

      const mockUser = { _id: '123' };
      const mockWorkout = { _id: 'workout1', totalDistance: 5 };
      const mockPlan = { _id: 'plan123', ...req.body };

      addToTrainingPlanSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue(mockUser);
      Workout.findById.mockResolvedValue(mockWorkout);
      TrainingPlan.create.mockResolvedValue(mockPlan);
      User.findByIdAndUpdate.mockResolvedValue(mockUser);
      TrainingPlan.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockResolvedValue(mockPlan)
        })
      });

      await addToTrainingPlan(req, res, next);

      expect(TrainingPlan.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Training plan created successfully',
        data: mockPlan
      });
    });

    it('should return 400 for duplicate days', async () => {
      req.body = {
        date: new Date(),
        week: 1,
        workouts: [
          { workout: 'workout1', day: 'Monday' },
          { workout: 'workout2', day: 'Monday' }
        ],
        user: '123'
      };

      addToTrainingPlanSchema.validate.mockReturnValue({ error: null });
      User.findById.mockResolvedValue({ _id: '123' });
      Workout.findById.mockResolvedValue({ _id: 'workout1' });

      await addToTrainingPlan(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400,
        message: 'Duplicate day Monday in plan'
      }));
    });
  });

  describe('getTrainingPlans', () => {
    it('should get training plans with date range', async () => {
      req.params.user = '123';
      req.query = {
        startDate: '2024-01-01',
        endDate: '2024-01-31'
      };

      const mockPlans = [
        { _id: 'plan1', date: new Date('2024-01-15'), totalDistance: 10, workouts: [] }
      ];

      User.findById.mockResolvedValue({ _id: '123' });
      TrainingPlan.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue(mockPlans)
        })
      });

      await getTrainingPlans(req, res, next);

      expect(TrainingPlan.find).toHaveBeenCalledWith({
        user: '123',
        date: {
          $gte: new Date('2024-01-01'),
          $lte: new Date('2024-01-31')
        }
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: 1,
        data: mockPlans,
        weeklySummaries: expect.any(Array)
      });
    });
  });

  describe('completeWorkout', () => {
    it('should mark workout as complete', async () => {
      req.params.user = '123';
      req.body = {
        planId: 'plan123',
        workoutId: 'workout123',
        actualDistance: 10,
        notes: 'Great run!'
      };

      const mockPlan = {
        _id: 'plan123',
        user: '123',
        workouts: [
          {
            workout: 'workout123',
            completed: false,
            actualDistance: 0
          }
        ],
        completedDistance: 0,
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue({ _id: '123' });
      TrainingPlan.findOne.mockResolvedValue(mockPlan);
      TrainingPlan.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockPlan)
      });

      await completeWorkout(req, res, next);

      expect(mockPlan.workouts[0].completed).toBe(true);
      expect(mockPlan.workouts[0].actualDistance).toBe(10);
      expect(mockPlan.workouts[0].notes).toBe('Great run!');
      expect(mockPlan.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 400 if planId or workoutId missing', async () => {
      req.params.user = '123';
      req.body = { planId: 'plan123' };

      await completeWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 400,
        message: 'Plan ID and workout ID are required'
      }));
    });

    it('should return 404 if workout not found in plan', async () => {
      req.params.user = '123';
      req.body = {
        planId: 'plan123',
        workoutId: 'nonexistent'
      };

      const mockPlan = {
        _id: 'plan123',
        user: '123',
        workouts: [{ workout: 'workout123' }]
      };

      User.findById.mockResolvedValue({ _id: '123' });
      TrainingPlan.findOne.mockResolvedValue(mockPlan);

      await completeWorkout(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({
        statusCode: 404,
        message: 'Workout not found in plan'
      }));
    });
  });
});
