import type { DesignPlan, RoomDimensions, ColorPalette } from '../types';

/**
 * A helper function to call our serverless API endpoint.
 * @param action The specific function to run on the backend.
 * @param payload The data required for that function.
 * @returns The JSON response from the backend.
 */
async function callApi<T>(action: string, payload: unknown): Promise<T> {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, payload }),
        });

        const result = await response.json();

        if (!response.ok) {
            // Use the error message from the backend if available, otherwise a generic one.
            throw new Error(result.error || `API request failed with status ${response.status}`);
        }

        return result as T;
    } catch (error) {
        console.error(`Error calling API action "${action}":`, error);
        // Re-throw the error so the UI can catch it and display a message.
        throw error;
    }
}

export const generateDesignIdeas = async (base64Image: string, style: string, dimensions: RoomDimensions, roomType: string): Promise<DesignPlan> => {
    const payload = { base64Image, style, dimensions, roomType };
    return callApi<DesignPlan>('generateDesignIdeas', payload);
};

export const generateRedesignedImage = async (designPlan: DesignPlan, style: string, roomType: string, base64Image: string, newColors?: ColorPalette): Promise<string> => {
    const payload = { designPlan, style, roomType, base64Image, newColors };
    const result = await callApi<{ imageBytes: string }>('generateRedesignedImage', payload);
    if (!result.imageBytes) {
        throw new Error("API response did not include image data.");
    }
    return result.imageBytes;
};

export const generateMorePalettes = async (designPlan: DesignPlan, style: string): Promise<ColorPalette[]> => {
    const payload = { designPlan, style };
    return callApi<ColorPalette[]>('generateMorePalettes', payload);
};
