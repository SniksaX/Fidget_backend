import { Request, Response } from 'express';
import axios from 'axios';
import { ethers } from 'ethers';

interface MoneriumTokenResponse { access_token: string; expires_in: number; token_type: string; }
interface MoneriumBalanceItem { currency: string; ticker: string; symbol: string; address: string; decimals: number; amount: string; }
interface MoneriumBalancesResponse { address: string; chain: string; balances: MoneriumBalanceItem[]; }

let moneriumAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getMoneriumAccessToken(): Promise<string> {
    if (moneriumAccessToken && Date.now() < tokenExpiresAt) {
        return moneriumAccessToken;
    }

    try {
        const { MONERIUM_CLIENT_ID, MONERIUM_CLIENT_SECRET, MONERIUM_API_URL } = process.env;
        if (!MONERIUM_CLIENT_ID || !MONERIUM_CLIENT_SECRET || !MONERIUM_API_URL) {
            throw new Error('Monerium environment variables are not set.');
        }

        
        
        
        const response = await axios.post<MoneriumTokenResponse>(
            `${MONERIUM_API_URL}/auth/token`,
            null, 
            {
                params: { 
                    grant_type: 'client_credentials',
                    client_id: MONERIUM_CLIENT_ID,
                    client_secret: MONERIUM_CLIENT_SECRET,
                },
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        

        moneriumAccessToken = response.data.access_token;
        tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000;
        console.log('[Monerium] Access token obtained successfully.');
        return moneriumAccessToken;

    } catch (error: any) {
        console.error('Error getting Monerium access token:', error.response?.data || error.message);
        throw new Error('Failed to obtain Monerium access token.');
    }
}


export const getMoneriumTokens = async (req: Request, res: Response) => {
    try {
        const accessToken = await getMoneriumAccessToken();
        const response = await axios.get(`${process.env.MONERIUM_API_URL}/tokens`, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/vnd.monerium.api-v2+json' },
        });
        
        res.status(200).json(response.data);
    } catch (error: any) {
        
        res.status(500).json({ message: 'Failed to fetch Monerium tokens.', error: error.message });
    }
};


export const getMoneriumSafeBalance = async (req: Request, res: Response) => {
    const { safeAddress } = req.body;
    if (!safeAddress || !ethers.isAddress(safeAddress)) {
        
        res.status(400).json({ error: 'Valid safeAddress is required.' });
        return;
    }
    try {
        const accessToken = await getMoneriumAccessToken();
        const response: any = await axios.get(
            `${process.env.MONERIUM_API_URL}/balances/sepolia/${safeAddress}`, {
                params: { currency: 'eur' },
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/vnd.monerium.api-v2+json' },
            }
        );
        const eureBalance = response.data.balances.find((b: any) => b.currency === 'eur');
        if (eureBalance) {
            
            res.status(200).json({ eureBalance: eureBalance.amount, eureDecimals: eureBalance.decimals });
        } else {
            
            res.status(200).json({ eureBalance: '0', eureDecimals: 18 });
        }
    } catch (error: any) {
        if ((error as any).response?.status === 404) {
            console.log(`[Monerium] Safe address ${safeAddress} not found in Monerium.`);
            
            res.status(200).json({ message: 'Safe not linked to Monerium.', eureBalance: '0', eureDecimals: 18 });
            return;
        }
        console.error('[Monerium] Error during balance retrieval:', (error as any).response?.data || (error as any).message);
        
        res.status(500).json({ error: 'Failed to retrieve Monerium EURe balance.' });
    }
};
