// src/pages/api/mint.ts
import { NextApiRequest, NextApiResponse } from "next";
import Irys from "@irys/sdk";
import path from "path";
import fs from "fs/promises";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      coverFileName,      // 'cover-uuid.png'
      audioFileName,      // 'audio-uuid.wav'
      ownerAddress,       // 'user's wallet address'
      songTitle,          // 'Song Name'
      artistName,         // 'Artist Name'
      genre,              // 'Genre (optional)'
    } = req.body;

    if (!coverFileName || !audioFileName || !ownerAddress || !songTitle || !artistName) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    console.log("Starting mint process for:", songTitle, "by", artistName);

    const privateKeySecret = process.env.IRYS_PRIVATE_KEY!;
    const rpcUrl = process.env.HELIUS_RPC_URL!;

    const getIrys = async () => {
      const irys = new Irys({
        url: "https://node1.irys.xyz",
        token: "solana",
        key: privateKeySecret,
        config: { providerUrl: rpcUrl },
      });
      return irys;
    };

    const uploadFileToIrys = async (filePath: string, fileType: string) => {
      const irys = await getIrys();
      const { size } = await fs.stat(filePath);
      const price = await irys.getPrice(size);
      console.log(`Uploading ${fileType} (${size} bytes) costs ${irys.utils.fromAtomic(price)} SOL`);

      await irys.fund(price);

      const response = await irys.uploadFile(filePath);
      console.log(`${fileType} uploaded: https://gateway.irys.xyz/${response.id}`);
      return `https://gateway.irys.xyz/${response.id}`;
    };

    // Upload Cover Image
    console.log("Uploading cover image...");
    const coverImagePath = path.join(process.cwd(), "public", coverFileName);
    const coverImageUrl = await uploadFileToIrys(coverImagePath, "Cover Image");

    // Upload Audio
    console.log("Uploading audio file...");
    const audioFilePath = path.join(process.cwd(), "public", audioFileName);
    const audioFileUrl = await uploadFileToIrys(audioFilePath, "Audio File");

    // Mint the cNFT
    console.log("Minting compressed NFT...");
    const mintCompressedNft = async () => {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "mint-jerseyfm",
          method: "mintCompressedNft",
          params: {
            name: `${songTitle} - ${artistName}`,
            symbol: "JFM", // JerseyFM
            owner: ownerAddress,
            description: `Jersey Club: ${songTitle} by ${artistName}`,
            attributes: [
              { trait_type: "Artist", value: artistName },
              { trait_type: "Song Title", value: songTitle },
              { trait_type: "Genre", value: genre || "Jersey Club" },
              { trait_type: "Audio File", value: audioFileUrl },
            ],
            imageUrl: coverImageUrl,
            externalUrl: "https://jersey.fm",
            sellerFeeBasisPoints: 1000, // 10% royalties
            creators: [
              { address: ownerAddress, share: 100 },
            ],
          },
        }),
      });
      const { result } = await response.json();
      console.log(`View transaction: https://xray.helius.xyz/tx/${result.signature}?network=mainnet`);
      return result;
    };

    const mintResult = await mintCompressedNft();

    return res.status(200).json({
      status: "success",
      assetId: mintResult.assetId,
      signature: mintResult.signature,
      explorerLink: `https://xray.helius.xyz/tx/${mintResult.signature}?network=mainnet`,
    });
  } catch (error: any) {
    console.error("Minting error:", error);
    return res.status(500).json({ status: "error", message: error.message });
  }
}

export default handler;
