/**
 * @file trainingController.test.js
 */

import request from "supertest";
import app from "../server.js";
import mongoose from "mongoose";

import Workout from "../models/workoutModel.js";
import TrainingPlan from "../models/planModel.js";
import User from "../models/userModel.js";

// Mocks de Mongoose
jest.mock("../models/workoutModel.js");
jest.mock("../models/planModel.js");
jest.mock("../models/userModel.js");

beforeEach(() => {
  jest.clearAllMocks();
});

/**
 * HELPERS
 */
const mockUser = {
  _id: "65d12345aa11aa22bb11cc44",
  username: "test",
  vdot: { value: 45 },
};

const mockWorkout = {
  _id: "1234567890",
  workoutName: "test workout",
  totalDistance: 5,
  user: mockUser._id,
};

const mockPlan = {
  _id: "plan123",
  user: mockUser._id,
  workouts: [
    { workout: mockWorkout._id, day: "Monday", completed: false }
  ],
  totalDistance: 5,
};

/**
 * -------------------------
 * GET WEEKLY SUMMARY
 * -------------------------
 */
describe("GET /api/training/summary/:user", () => {
  it("returns error if user does not exist", async () => {
    User.findById.mockResolvedValue(null);

    const res = await request(app).get(`/api/training/summary/${mockUser._id}`);
    expect(res.statusCode).toBe(404);
  });

  it("returns weekly summary successfully", async () => {
    User.findById.mockResolvedValue(mockUser);
    TrainingPlan.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([mockPlan]),
    });

    const res = await request(app).get(`/api/training/summary/${mockUser._id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.workoutsPlanned).toBe(1);
  });
});

/**
 * -------------------------
 * CREATE WORKOUT
 * -------------------------
 */
describe("POST /api/training/workout", () => {
  it("returns 404 if user does not exist", async () => {
    User.findById.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/training/workout")
      .send({ user: mockUser._id });

    expect(res.statusCode).toBe(404);
  });

  it("creates workout successfully", async () => {
    User.findById.mockResolvedValue(mockUser);
    Workout.create.mockResolvedValue(mockWorkout);

    const res = await request(app)
      .post("/api/training/workout")
      .send({ workoutName: "X", user: mockUser._id });

    expect(res.statusCode).toBe(201);
    expect(res.body.data._id).toBe(mockWorkout._id);
  });
});

/**
 * -------------------------
 * GET ALL WORKOUTS
 * -------------------------
 */
describe("GET /api/training/workouts/:user", () => {
  it("returns all workouts", async () => {
    User.findById.mockResolvedValue(mockUser);
    Workout.find.mockResolvedValue([mockWorkout]);

    const res = await request(app)
      .get(`/api/training/workouts/${mockUser._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(1);
  });
});

/**
 * -------------------------
 * GET WORKOUT BY ID
 * -------------------------
 */
describe("GET /api/training/workout/:id/:user", () => {
  it("returns 404 if not belongs to user", async () => {
    Workout.findOne.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/training/workout/${mockWorkout._id}/${mockUser._id}`);

    expect(res.statusCode).toBe(404);
  });

  it("returns workout successfully", async () => {
    Workout.findOne.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockWorkout),
    });

    const res = await request(app)
      .get(`/api/training/workout/${mockWorkout._id}/${mockUser._id}`);

    expect(res.statusCode).toBe(200);
  });
});

/**
 * -------------------------
 * UPDATE WORKOUT
 * -------------------------
 */
describe("PUT /api/training/workout/:id/:user", () => {
  it("returns 404 for invalid workout", async () => {
    User.findById.mockResolvedValue(mockUser);
    Workout.findOne.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/training/workout/${mockWorkout._id}/${mockUser._id}`);

    expect(res.statusCode).toBe(404);
  });

  it("updates workout successfully", async () => {
    User.findById.mockResolvedValue(mockUser);
    Workout.findOne.mockResolvedValue(mockWorkout);
    Workout.findByIdAndUpdate.mockResolvedValue(mockWorkout);

    const res = await request(app)
      .put(`/api/training/workout/${mockWorkout._id}/${mockUser._id}`);

    expect(res.statusCode).toBe(200);
  });
});

/**
 * -------------------------
 * DELETE WORKOUT
 * -------------------------
 */
describe("DELETE /api/training/workout/:id/:user", () => {
  it("deletes workout", async () => {
    User.findById.mockResolvedValue(mockUser);
    Workout.findOne.mockResolvedValue(mockWorkout);

    const res = await request(app)
      .delete(`/api/training/workout/${mockWorkout._id}/${mockUser._id}`);

    expect(res.statusCode).toBe(200);
  });
});

/**
 * -------------------------
 * ADD TO TRAINING PLAN
 * -------------------------
 */
describe("POST /api/training/plan", () => {
  it("creates training plan", async () => {
    User.findById.mockResolvedValue(mockUser);
    Workout.findById.mockResolvedValue(mockWorkout);
    TrainingPlan.create.mockResolvedValue(mockPlan);

    const res = await request(app)
      .post("/api/training/plan")
      .send({
        user: mockUser._id,
        workouts: [{ workout: mockWorkout._id, day: "Monday" }],
      });

    expect(res.statusCode).toBe(201);
  });
});

/**
 * -------------------------
 * GET TRAINING PLANS
 * -------------------------
 */
describe("GET /api/training/plans/:user", () => {
  it("returns plans", async () => {
    User.findById.mockResolvedValue(mockUser);

    TrainingPlan.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([mockPlan]),
      }),
    });

    const res = await request(app)
      .get(`/api/training/plans/${mockUser._id}`);

    expect(res.statusCode).toBe(200);
  });
});

/**
 * -------------------------
 * MARK WORKOUT COMPLETE
 * -------------------------
 */
describe("PUT /api/training/plan/complete/:user", () => {
  it("marks workout completed", async () => {
    User.findById.mockResolvedValue(mockUser);
    TrainingPlan.findOne.mockResolvedValue(mockPlan);

    TrainingPlan.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mockPlan),
    });

    const res = await request(app)
      .put(`/api/training/plan/complete/${mockUser._id}`)
      .send({
        planId: mockPlan._id,
        workoutId: mockWorkout._id,
      });

    expect(res.statusCode).toBe(200);
  });
});
