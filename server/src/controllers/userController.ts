
import { Request, Response } from 'express';
import { SanityClient } from '@sanity/client';

export function createUserController(sanity: SanityClient) {
  return {
    
    updateProfile: async (req: Request, res: Response) => {
      const userId = req.user?.ID;
      const { name } = req.body; 

      if (!userId) {
        return res.status(401).json({ error: "Unauthorized. User not found in token." });
      }

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "A valid name is required." });
      }

      try {
        
        const updatedUser = await sanity
          .patch(userId)
          .set({ name: name.trim() })
          .commit();

        console.log(`[User] Updated name for user ${userId} to "${updatedUser.name}"`);

        res.status(200).json({
          message: "Profile updated successfully.",
          user: {
            name: updatedUser.name,
            email: updatedUser.email
          }
        });
      } catch (error: any) {
        console.error("[Update Profile] Error:", error);
        res.status(500).json({ error: "Failed to update profile." });
      }
    }
  };
}