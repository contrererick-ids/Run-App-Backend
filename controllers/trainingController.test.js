// getWeeklySummary.test.js
import { jest } from '@jest/globals';

// =====================================================================
// MOCK SETUP (ESM style)
// =====================================================================

const mockFindById = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockCreate = jest.fn();
const mockErrorHandler = jest.fn();
const mockValidate = jest.fn();
const mockFind = jest.fn()
const mockWorkoutFind = jest.fn();
const mockWorkoutFindOne = jest.fn();
const mockWorkoutFindById = jest.fn();
const mockWorkoutFindByIdAndUpdate = jest.fn();
const mockWorkoutFindByIdAndDelete = jest.fn();
const mockTrainingPlanCreate = jest.fn();
const mockTrainingPlanFindById = jest.fn();
const mockAddToTrainingPlanValidate = jest.fn();
const mockTrainingPlanFindOne = jest.fn();
const mockTrainingPlanFindByIdAndUpdate = jest.fn();
const mockTrainingPlanFindByIdAndDelete = jest.fn();

jest.unstable_mockModule('../models/planModel.js', () => ({
  default: { 
    find: mockFind,
    findOne: mockTrainingPlanFindOne,
    findById: mockTrainingPlanFindById,
    findByIdAndUpdate: mockTrainingPlanFindByIdAndUpdate,
    findByIdAndDelete: mockTrainingPlanFindByIdAndDelete,
    create: mockTrainingPlanCreate
  }
}));


jest.unstable_mockModule('../models/workoutModel.js', () => ({
  default: { 
    create: mockCreate, 
    find: mockWorkoutFind,
    findOne: mockWorkoutFindOne,
    findById: mockWorkoutFindById,
    findByIdAndUpdate: mockWorkoutFindByIdAndUpdate,
    findByIdAndDelete: mockWorkoutFindByIdAndDelete
  }
}));

jest.unstable_mockModule('../models/userModel.js', () => ({
  default: { findById: mockFindById, findByIdAndUpdate: mockFindByIdAndUpdate }
}));

jest.unstable_mockModule('../middleware/error.js', () => ({
  errorHandler: mockErrorHandler
}));

jest.unstable_mockModule('../validations/workoutValidation.js', () => ({
  createWorkoutSchema: { validate: mockValidate },
  addToTrainingPlanSchema: { validate: mockAddToTrainingPlanValidate }
}));

// =====================================================================
// IMPORTS (after mocks)
// =====================================================================
const { getWeeklySummary, createWorkout, getAllWorkouts } = await import('../controllers/training.Controller.js');
const httpMocks = (await import('node-mocks-http')).default;

let req, res, next;

beforeEach(() => {
  req = httpMocks.createRequest({ params: { user: '123' } });
  res = httpMocks.createResponse();
  res.status = jest.fn().mockReturnThis();
  res.json = jest.fn();
  next = jest.fn();
  jest.clearAllMocks();
});

// =====================================================================
// TESTS
// =====================================================================
describe('getWeeklySummary', () => {
  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    await getWeeklySummary(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return weekly summary when user exists and plans found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });

    const mockPlans = [
      {
        totalDistance: 10,
        completedDistance: 8,
        workouts: [
          { day: 'Monday', completed: true },
          { day: 'Tuesday', completed: false }
        ]
      }
    ];

    // Return an object with a populate function that resolves to mockPlans
    mockFind.mockReturnValue({
      populate: () => Promise.resolve(mockPlans)
    });

    await getWeeklySummary(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(mockFind).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        totalPlannedDistance: 10,
        totalCompletedDistance: 8,
        workoutsPlanned: 2,
        workoutsCompleted: 1,
        days: expect.objectContaining({
          Monday: { planned: [expect.any(Object)], completed: [expect.any(Object)] },
          Tuesday: { planned: [expect.any(Object)], completed: [] }
        })
      })
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockRejectedValue(new Error('DB error'));

    await getWeeklySummary(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for createWorkout
// =====================================================================
describe('createWorkout', () => {
  it('should call next with validation error', async () => {
    const error = { details: [{ message: 'Invalid data' }] };
    mockValidate.mockReturnValue({ error });
    mockErrorHandler.mockReturnValue({ statusCode: 400, message: 'Invalid data' });

    await createWorkout(req, res, next);

    expect(mockValidate).toHaveBeenCalledWith(req.body);
    expect(next).toHaveBeenCalledWith({ statusCode: 400, message: 'Invalid data' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next if user not found', async () => {
    mockValidate.mockReturnValue({ error: null });
    mockFindById.mockResolvedValue(null);
    mockErrorHandler.mockReturnValue({ statusCode: 404, message: 'User not found' });

    req.body = { workoutName: 'Run', user: '123' };
    await createWorkout(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith({ statusCode: 404, message: 'User not found' });
  });

  it('should call next if Vdot missing but pace provided', async () => {
    mockValidate.mockReturnValue({ error: null });
    mockFindById.mockResolvedValue({ _id: '123', vdot: {} });
    mockErrorHandler.mockReturnValue({ statusCode: 400, message: 'User must have a Vdot value to set paces' });

    req.body = { workoutName: 'Run', user: '123', warmUp: { pace: '5:00' } };
    await createWorkout(req, res, next);

    expect(next).toHaveBeenCalledWith({ statusCode: 400, message: 'User must have a Vdot value to set paces' });
  });

  it('should create workout and update user when valid', async () => {
    mockValidate.mockReturnValue({ error: null });
    mockFindById.mockResolvedValue({ _id: '123', vdot: { value: 50 } });
    const workout = { _id: 'w1', workoutName: 'Run' };
    mockCreate.mockResolvedValue(workout);

    req.body = { workoutName: 'Run', user: '123' };
    await createWorkout(req, res, next);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ workoutName: 'Run', user: '123' }));
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('123', { $push: { workouts: 'w1' } });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Workout created successfully',
      data: workout
    });
  });

  it('should call next if exception occurs', async () => {
    mockValidate.mockReturnValue({ error: null });
    mockFindById.mockRejectedValue(new Error('DB error'));

    req.body = { workoutName: 'Run', user: '123' };
    await createWorkout(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for getAllWorkouts
// =====================================================================

describe('getAllWorkouts', () => {
  it('should call next with error if user param is missing', async () => {
    req = httpMocks.createRequest({ params: {} });
    const error = { statusCode: 400, message: 'User is required' };
    mockErrorHandler.mockReturnValue(error);

    await getAllWorkouts(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    await getAllWorkouts(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return workouts when user exists', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    const mockWorkouts = [
      { _id: 'w1', name: 'Workout 1' },
      { _id: 'w2', name: 'Workout 2' }
    ];
    mockWorkoutFind.mockResolvedValue(mockWorkouts);

    await getAllWorkouts(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(mockWorkoutFind).toHaveBeenCalledWith({ user: '123' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      count: 2,
      data: mockWorkouts
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockWorkoutFind.mockRejectedValue(new Error('DB error'));

    await getAllWorkouts(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for getWorkoutById
// =====================================================================
describe('getWorkoutById', () => {
  it('should call next with error if workout not found', async () => {
    mockWorkoutFindOne.mockReturnValue({
      populate: () => Promise.resolve(null)
    });
    const error = { statusCode: 404, message: 'Workout not found' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    const { getWorkoutById } = await import('../controllers/training.Controller.js');
    await getWorkoutById(req, res, next);

    expect(mockWorkoutFindOne).toHaveBeenCalledWith({ _id: 'w1', user: '123' });
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return workout when found', async () => {
    const mockWorkout = { _id: 'w1', user: '123', name: 'Workout 1' };
    mockWorkoutFindOne.mockReturnValue({
      populate: () => Promise.resolve(mockWorkout)
    });

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    const { getWorkoutById } = await import('../controllers/training.Controller.js');
    await getWorkoutById(req, res, next);

    expect(mockWorkoutFindOne).toHaveBeenCalledWith({ _id: 'w1', user: '123' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockWorkout
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockWorkoutFindOne.mockImplementation(() => { throw new Error('DB error'); });

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    const { getWorkoutById } = await import('../controllers/training.Controller.js');
    await getWorkoutById(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for updateWorkout
// =====================================================================
describe('updateWorkout', () => {
  let updateWorkout;

  beforeAll(async () => {
    ({ updateWorkout } = await import('../controllers/training.Controller.js'));
  });

  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    await updateWorkout(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next with error if workout not found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockWorkoutFindOne.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'Workout not found or unauthorized' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    await updateWorkout(req, res, next);

    expect(mockWorkoutFindOne).toHaveBeenCalledWith({ _id: 'w1', user: '123' });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if Vdot required but missing', async () => {
    mockFindById.mockResolvedValue({ _id: '123', vdot: null });
    mockWorkoutFindOne.mockResolvedValue({ _id: 'w1', user: '123' });
    const error = { statusCode: 400, message: 'User must have a Vdot value to set paces' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ 
      params: { id: 'w1', user: '123' },
      body: { warmUp: { pace: '5:00/km' } }
    });

    await updateWorkout(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should update workout successfully', async () => {
    mockFindById.mockResolvedValue({ _id: '123', vdot: { value: 50 } });
    mockWorkoutFindOne.mockResolvedValue({ _id: 'w1', user: '123' });
    const updatedWorkout = { _id: 'w1', user: '123', name: 'Updated Workout' };
    mockWorkoutFindByIdAndUpdate.mockResolvedValue(updatedWorkout);

    req = httpMocks.createRequest({ 
      params: { id: 'w1', user: '123' },
      body: { name: 'Updated Workout' }
    });

    await updateWorkout(req, res, next);

    expect(mockWorkoutFindByIdAndUpdate).toHaveBeenCalledWith('w1', { name: 'Updated Workout' }, {
      new: true,
      runValidators: true
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Workout updated successfully',
      data: updatedWorkout
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockRejectedValue(new Error('DB error'));

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    await updateWorkout(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for deleteWorkout
// =====================================================================
describe('deleteWorkout', () => {
  let deleteWorkout;

  beforeAll(async () => {
    ({ deleteWorkout } = await import('../controllers/training.Controller.js'));
  });

  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    await deleteWorkout(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next with error if workout not found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockWorkoutFindOne.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'Workout not found or unauthorized' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    await deleteWorkout(req, res, next);

    expect(mockWorkoutFindOne).toHaveBeenCalledWith({ _id: 'w1', user: '123' });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should delete workout successfully', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockWorkoutFindOne.mockResolvedValue({ _id: 'w1', user: '123' });
    mockWorkoutFindByIdAndDelete.mockResolvedValue({});

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    await deleteWorkout(req, res, next);

    expect(mockWorkoutFindByIdAndDelete).toHaveBeenCalledWith('w1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Workout deleted successfully',
      data: {}
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockRejectedValue(new Error('DB error'));

    req = httpMocks.createRequest({ params: { id: 'w1', user: '123' } });

    await deleteWorkout(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for addToTrainingPlan
// =====================================================================
describe('addToTrainingPlan', () => {
  let addToTrainingPlan;

  beforeAll(async () => {
    ({ addToTrainingPlan } = await import('../controllers/training.Controller.js'));
  });

  it('should call next with error if validation fails', async () => {
    const validationError = { details: [{ message: 'Invalid data' }] };
    mockAddToTrainingPlanValidate.mockReturnValue({ error: validationError });
    const error = { statusCode: 400, message: 'Invalid data' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ body: {} });

    await addToTrainingPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if user not found', async () => {
    mockAddToTrainingPlanValidate.mockReturnValue({ error: null });
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ body: { user: '123', workouts: [] } });

    await addToTrainingPlan(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if workout not found', async () => {
    mockAddToTrainingPlanValidate.mockReturnValue({ error: null });
    mockFindById.mockResolvedValue({ _id: '123' });
    mockWorkoutFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'Workout w1 not found' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ 
      body: { user: '123', workouts: [{ workout: 'w1', day: 'Monday' }] } 
    });

    await addToTrainingPlan(req, res, next);

    expect(mockWorkoutFindById).toHaveBeenCalledWith('w1');
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if duplicate day in plan', async () => {
    mockAddToTrainingPlanValidate.mockReturnValue({ error: null });
    mockFindById.mockResolvedValue({ _id: '123' });
    mockWorkoutFindById.mockResolvedValue({ _id: 'w1', totalDistance: 5 });
    const error = { statusCode: 400, message: 'Duplicate day Monday in plan' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ 
      body: { 
        user: '123', 
        workouts: [
          { workout: 'w1', day: 'Monday' },
          { workout: 'w1', day: 'Monday' }
        ] 
      } 
    });

    await addToTrainingPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should create training plan successfully', async () => {
    mockAddToTrainingPlanValidate.mockReturnValue({ error: null });
    mockFindById.mockResolvedValue({ _id: '123', trainingPlans: [] });
    mockWorkoutFindById.mockResolvedValue({ _id: 'w1', totalDistance: 5 });

    const trainingPlan = { _id: 'tp1' };
    mockTrainingPlanCreate.mockResolvedValue(trainingPlan);
    mockFindByIdAndUpdate.mockResolvedValue({});
    const populatedPlan = { _id: 'tp1', workouts: [], user: { username: 'test' } };
    mockTrainingPlanFindById.mockReturnValue({
      populate: () => ({
        populate: () => Promise.resolve(populatedPlan)
      })
    });

    req = httpMocks.createRequest({ 
      body: { 
        user: '123', 
        workouts: [{ workout: 'w1', day: 'Monday' }],
        date: '2025-11-30',
        week: 1
      } 
    });

    await addToTrainingPlan(req, res, next);

    expect(mockTrainingPlanCreate).toHaveBeenCalledWith(expect.objectContaining({
    user: '123',
    totalDistance: 5
    }));
    expect(mockFindByIdAndUpdate).toHaveBeenCalledWith('123', {
      $push: { trainingPlans: 'tp1' }
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Training plan created successfully',
      data: populatedPlan
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockAddToTrainingPlanValidate.mockReturnValue({ error: null });
    mockFindById.mockRejectedValue(new Error('DB error'));

    req = httpMocks.createRequest({ body: { user: '123', workouts: [] } });

    await addToTrainingPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for getTrainingPlans
// =====================================================================
describe('getTrainingPlans', () => {
  let getTrainingPlans;

  beforeAll(async () => {
    ({ getTrainingPlans } = await import('../controllers/training.Controller.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = httpMocks.createRequest({ params: { user: '123' }, query: {} });
    res = httpMocks.createResponse();
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn();
    next = jest.fn();
  });

  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    await getTrainingPlans(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return training plans and weekly summaries when user exists', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });

    const mockPlans = [
      {
        _id: 'tp1',
        date: '2025-11-01',
        totalDistance: 10,
        completedDistance: 8,
        workouts: [
          { day: 'Monday', completed: true, workout: { workoutName: 'Run' } },
          { day: 'Tuesday', completed: false, workout: { workoutName: 'Swim' } }
        ]
      }
    ];

    // Simulate TrainingPlan.find().populate().sort()
    mockFind.mockReturnValue({
      populate: () => ({
        sort: () => Promise.resolve(mockPlans)
      })
    });

    await getTrainingPlans(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(mockFind).toHaveBeenCalledWith({ user: '123' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      count: 1,
      data: mockPlans,
      weeklySummaries: expect.any(Array)
    }));
  });

  it('should apply date range filter when provided', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    req = httpMocks.createRequest({ 
      params: { user: '123' }, 
      query: { startDate: '2025-11-01', endDate: '2025-11-30' } 
    });

    mockFind.mockReturnValue({
      populate: () => ({
        sort: () => Promise.resolve([])
      })
    });

    await getTrainingPlans(req, res, next);

    expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
      user: '123',
      date: { $gte: new Date('2025-11-01'), $lte: new Date('2025-11-30') }
    }));
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockRejectedValue(new Error('DB error'));

    await getTrainingPlans(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for getTrainingPlanById
// =====================================================================
describe('getTrainingPlanById', () => {
  let getTrainingPlanById;

  beforeAll(async () => {
    ({ getTrainingPlanById } = await import('../controllers/training.Controller.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = httpMocks.createRequest({ params: { id: 'tp1', user: '123' } });
    res = httpMocks.createResponse();
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn();
    next = jest.fn();
  });

  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    await getTrainingPlanById(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next with error if training plan not found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockTrainingPlanFindOne.mockReturnValue({
      populate: () => Promise.resolve(null)
    });
    const error = { statusCode: 404, message: 'Training plan not found' };
    mockErrorHandler.mockReturnValue(error);

    await getTrainingPlanById(req, res, next);

    expect(mockTrainingPlanFindOne).toHaveBeenCalledWith({ _id: 'tp1', user: '123' });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should return training plan when found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    const mockPlan = { _id: 'tp1', user: '123', workouts: [] };
    mockTrainingPlanFindOne.mockReturnValue({
      populate: () => Promise.resolve(mockPlan)
    });

    await getTrainingPlanById(req, res, next);

    expect(mockTrainingPlanFindOne).toHaveBeenCalledWith({ _id: 'tp1', user: '123' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: mockPlan
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockRejectedValue(new Error('DB error'));

    await getTrainingPlanById(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for updateTrainingPlan
// =====================================================================
describe('updateTrainingPlan', () => {
  let updateTrainingPlan;

  beforeAll(async () => {
    ({ updateTrainingPlan } = await import('../controllers/training.Controller.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = httpMocks.createRequest({ params: { id: 'tp1', user: '123' }, body: {} });
    res = httpMocks.createResponse();
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn();
    next = jest.fn();
  });

  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    await updateTrainingPlan(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if training plan not found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockTrainingPlanFindOne.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'Training plan not found or unauthorized' };
    mockErrorHandler.mockReturnValue(error);

    await updateTrainingPlan(req, res, next);

    expect(mockTrainingPlanFindOne).toHaveBeenCalledWith({ _id: 'tp1', user: '123' });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if workout not found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockTrainingPlanFindOne.mockResolvedValue({ _id: 'tp1', user: '123', totalDistance: 10 });
    mockWorkoutFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'Workout w1 not found' };
    mockErrorHandler.mockReturnValue(error);

    req = httpMocks.createRequest({ 
      params: { id: 'tp1', user: '123' },
      body: { workouts: [{ workout: 'w1' }] }
    });

    await updateTrainingPlan(req, res, next);

    expect(mockWorkoutFindById).toHaveBeenCalledWith('w1');
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should update training plan successfully with workouts', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockTrainingPlanFindOne.mockResolvedValue({ _id: 'tp1', user: '123', totalDistance: 0 });
    mockWorkoutFindById.mockResolvedValue({ _id: 'w1', totalDistance: 5 });

    const updatedPlan = { _id: 'tp1', user: '123', totalDistance: 5 };
    mockTrainingPlanFindByIdAndUpdate.mockReturnValue({
      populate: () => Promise.resolve(updatedPlan)
    });

    req = httpMocks.createRequest({ 
      params: { id: 'tp1', user: '123' },
      body: { workouts: [{ workout: 'w1' }], week: 2 }
    });

    await updateTrainingPlan(req, res, next);

    expect(mockTrainingPlanFindByIdAndUpdate).toHaveBeenCalledWith('tp1', expect.objectContaining({
      week: 2,
      workouts: [{ workout: 'w1' }],
      totalDistance: 5
    }), expect.objectContaining({ new: true, runValidators: true }));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Training plan updated successfully',
      data: updatedPlan
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockRejectedValue(new Error('DB error'));

    await updateTrainingPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for deleteTrainingPlan
// =====================================================================
describe('deleteTrainingPlan', () => {
  let deleteTrainingPlan;

  beforeAll(async () => {
    ({ deleteTrainingPlan } = await import('../controllers/training.Controller.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = httpMocks.createRequest({ params: { id: 'tp1', user: '123' } });
    res = httpMocks.createResponse();
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn();
    next = jest.fn();
  });

  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    await deleteTrainingPlan(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next with error if training plan not found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockTrainingPlanFindOne.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'Training plan not found or unauthorized' };
    mockErrorHandler.mockReturnValue(error);

    await deleteTrainingPlan(req, res, next);

    expect(mockTrainingPlanFindOne).toHaveBeenCalledWith({ _id: 'tp1', user: '123' });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should delete training plan successfully', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockTrainingPlanFindOne.mockResolvedValue({ _id: 'tp1', user: '123' });
    mockTrainingPlanFindByIdAndDelete.mockResolvedValue({});

    await deleteTrainingPlan(req, res, next);

    expect(mockTrainingPlanFindByIdAndDelete).toHaveBeenCalledWith('tp1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Training plan deleted successfully',
      data: {}
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockRejectedValue(new Error('DB error'));

    await deleteTrainingPlan(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// =====================================================================
// TESTS for completeWorkout
// =====================================================================
describe('completeWorkout', () => {
  let completeWorkout;

  beforeAll(async () => {
    ({ completeWorkout } = await import('../controllers/training.Controller.js'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    req = httpMocks.createRequest({ 
      params: { user: '123' },
      body: { planId: 'tp1', workoutId: 'w1' }
    });
    res = httpMocks.createResponse();
    res.status = jest.fn().mockReturnThis();
    res.json = jest.fn();
    next = jest.fn();
  });

  it('should call next with error if required fields missing', async () => {
    req = httpMocks.createRequest({ params: { user: '123' }, body: {} });
    const error = { statusCode: 400, message: 'Plan ID and workout ID are required' };
    mockErrorHandler.mockReturnValue(error);

    await completeWorkout(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if user not found', async () => {
    mockFindById.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'User not found' };
    mockErrorHandler.mockReturnValue(error);

    await completeWorkout(req, res, next);

    expect(mockFindById).toHaveBeenCalledWith('123');
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if training plan not found', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    mockTrainingPlanFindOne.mockResolvedValue(null);
    const error = { statusCode: 404, message: 'Training plan not found' };
    mockErrorHandler.mockReturnValue(error);

    await completeWorkout(req, res, next);

    expect(mockTrainingPlanFindOne).toHaveBeenCalledWith({ _id: 'tp1', user: '123' });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('should call next with error if workout not found in plan', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    const plan = { _id: 'tp1', user: '123', workouts: [], save: jest.fn() };
    mockTrainingPlanFindOne.mockResolvedValue(plan);
    const error = { statusCode: 404, message: 'Workout not found in plan' };
    mockErrorHandler.mockReturnValue(error);

    await completeWorkout(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('should mark workout as complete and update plan', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    const plan = { 
      _id: 'tp1', 
      user: '123', 
      workouts: [{ workout: 'w1', toString: () => 'w1' }], 
      save: jest.fn().mockResolvedValue(true) 
    };
    mockTrainingPlanFindOne.mockResolvedValue(plan);

    const updatedPlan = { _id: 'tp1', workouts: [{ workout: 'w1', completed: true }] };
    mockTrainingPlanFindById.mockReturnValue({
      populate: () => Promise.resolve(updatedPlan)
    });

    await completeWorkout(req, res, next);

    expect(plan.save).toHaveBeenCalled();
    expect(mockTrainingPlanFindById).toHaveBeenCalledWith('tp1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Workout marked as complete',
      data: updatedPlan
    });
  });

  it('should call next with error if exception occurs', async () => {
    mockFindById.mockRejectedValue(new Error('DB error'));

    await completeWorkout(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should update actualDistance and notes when provided', async () => {
    mockFindById.mockResolvedValue({ _id: '123' });
    const plan = { 
        _id: 'tp1', 
        user: '123', 
        workouts: [{ workout: 'w1', toString: () => 'w1' }], 
        save: jest.fn().mockResolvedValue(true) 
    };
    mockTrainingPlanFindOne.mockResolvedValue(plan);

    const updatedPlan = { 
        _id: 'tp1', 
        workouts: [{ workout: 'w1', completed: true, actualDistance: 7, notes: 'Felt good' }] 
    };
    mockTrainingPlanFindById.mockReturnValue({
        populate: () => Promise.resolve(updatedPlan)
    });

    req = httpMocks.createRequest({ 
        params: { user: '123' },
        body: { planId: 'tp1', workoutId: 'w1', actualDistance: 7, notes: 'Felt good' }
    });

    await completeWorkout(req, res, next);

    // Verify the workout fields were updated
    expect(plan.workouts[0].actualDistance).toBe(7);
    expect(plan.workouts[0].notes).toBe('Felt good');
    expect(plan.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Workout marked as complete',
        data: updatedPlan
    });
    });
});
