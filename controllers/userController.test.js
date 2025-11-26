import { jest, describe, beforeEach, it, expect } from '@jest/globals';
import { updateUser } from '../controllers/userController.js';
import User from '../models/userModel.js';

// Mocks
jest.mock('../middleware/error.js', () => ({
    errorHandler: jest.fn((code, msg) => ({ statusCode: code, message: msg }))
}));

jest.mock('bcryptjs', () => ({
    default: {
        hashSync: jest.fn()
    }
}));

jest.mock('express-async-handler', () => ({
  default: (fn) => (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
}
}));

jest.mock('../models/userModel.js', () => ({
    default: {
        findByIdAndUpdate: jest.fn(),
    },
}));

describe('testing for the updateUser function', () => {
    let req, res, next;

    beforeEach(() => {
        jest.clearAllMocks();
        
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        
        next = jest.fn();
    });

    it('Debe retornar el error 401 si el ID del usuario no coincide', async () => {
        req = {
            user: { id: '123' },
            params: { id: '456' },
            body: {}
        };

        await updateUser(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 401,
                message: 'You can only update your own account!',
            })
        );

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('Debe retornar el error 401 si el ID de params viene vacío', async () => {
        req = {
            user: { id: '123' },
            params: { id: '' }, // ID vacío
            body: {}
        };

        await updateUser(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 401,
                message: 'You can only update your own account!',
            })
        );

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('Debe retornar el error 401 si el ID de params es null', async () => {
        req = {
            user: { id: '123' },
            params: { id: null }, // ID null
            body: {}
        };

        await updateUser(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 401,
                message: 'You can only update your own account!',
            })
        );

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('Debe retornar el error 401 si el ID de params es undefined', async () => {
        req = {
            user: { id: '123' },
            params: { id: undefined }, // ID undefined
            body: {}
        };

        await updateUser(req, res, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(
            expect.objectContaining({
                statusCode: 401,
                message: 'You can only update your own account!',
            })
        );

        expect(res.status).not.toHaveBeenCalled();
        expect(res.json).not.toHaveBeenCalled();
    });

    it('Debe actualizar el usuario hasheando la contraseña cuando password existe en body', async () => {
        const newPassword = 'newpassword123';
        const hashedPassword = 'hashednewpassword';
        
        bcryptjs.default.hashSync.mockReturnValue(hashedPassword);

        const mockUpdatedUser = {
            _id: '123',
            username: 'testuser',
            email: 'test@example.com',
            avatar: 'avatar.jpg',
            password: hashedPassword, // Contraseña hasheada
            toObject: jest.fn().mockReturnValue({
                _id: '123',
                username: 'testuser',
                email: 'test@example.com',
                avatar: 'avatar.jpg',
                password: hashedPassword
            })
        };
        
        req = {
            user: { id: '123' },
            params: { id: '123' },
            body: {
                password: newPassword, // Contraseña SIN hashear en el body
                username: 'updateduser',
                email: 'updated@example.com'
            }
        };
        
        User.findByIdAndUpdate.mockResolvedValue(mockUpdatedUser);

        await updateUser(req, res, next);
        
        expect(bcryptjs.default.hashSync).toHaveBeenCalledTimes(1);
        expect(bcryptjs.default.hashSync).toHaveBeenCalledWith(newPassword, 10);
        
        expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
            '123',
            {
                password: hashedPassword, // Debe ser la hasheada
                username: 'updateduser',
                email: 'updated@example.com',
                avatar: undefined
            },
            { new: true }
        );
        
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            _id: '123',
            username: 'testuser',
            email: 'test@example.com',
            avatar: 'avatar.jpg'
        });
        expect(next).not.toHaveBeenCalled();
    });
});