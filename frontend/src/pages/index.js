import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { 
  Trophy, Wallet, History, Activity, 
  Copy, CheckCircle2, Loader2, Zap, PenTool, Lock, RefreshCw, Swords, AlertCircle
} from "lucide-react";

// --- CONTRACT CONFIGURATION ---
const CONTRACT_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";

const CONTRACT_ABI = [
  "function createGame() external payable returns (uint256)",
  "function joinGame(uint256 _gameId) external payable",
  "function reportWin(uint256 _gameId, bytes calldata _signature) external",
  "function getGameInfo(uint256 _gameId) external view returns (address p1, address p2, uint256 wager, bool active, address winner)",
  "event GameCreated(uint256 indexed gameId, address indexed creator, uint256 wager)",
  "event PlayerJoined(uint256 indexed gameId, address indexed opponent)",
  "event GameEnded(uint256 indexed gameId, address indexed winner, uint256 payout)"
];

const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

export default function AdvancedChessPlatform() {
  // --- STATE ---
  const [game, setGame] = useState(new Chess());
  const [wallet, setWallet] = useState("");
  const [contract, setContract] = useState(null);
  const [balance, setBalance] = useState("0.0");
  const [provider, setProvider] = useState(null);
  
  const [gameId, setGameId] = useState("");
  const [gameData, setGameData] = useState(null);
  // We do NOT clear this on account change so you can test locally (Sign as P1 -> Switch -> Claim as P2)
  const [loserSignature, setLoserSignature] = useState(null); 
  
  const [inputGameId, setInputGameId] = useState("");
  const [status, setStatus] = useState("System Ready. Connect Wallet.");
  const [statusType, setStatusType] = useState("neutral"); 
  const [moveHistory, setMoveHistory] = useState([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // --- 1. HANDLE ACCOUNT SWITCHING ---
  useEffect(() => {
    if (typeof window.ethereum === "undefined") return;

    const handleAccountsChanged = async (newAccounts) => {
      if (newAccounts.length > 0) {
        const newWallet = newAccounts[0];
        setWallet(newWallet);
        // Note: We intentionally don't clear loserSignature here to allow local testing flow
        
        // Rebuild Signer & Contract
        const newProvider = new ethers.BrowserProvider(window.ethereum);
        const newSigner = await newProvider.getSigner();
        const newContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, newSigner);
        
        setProvider(newProvider);
        setContract(newContract);
        setupContractListeners(newContract);

        const newBal = await newProvider.getBalance(newWallet);
        setBalance(ethers.formatEther(newBal));
        updateStatus(`Switched to: ${shortAddr(newWallet)}`, "neutral");

        if (gameId) {
          fetchGameData(gameId, newContract);
        }
      } else {
        setWallet("");
        setContract(null);
        updateStatus("Wallet Disconnected", "warning");
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
  }, [gameId]); 

  // --- 2. INITIALIZATION ---
  const setupContractListeners = (chessContract) => {
    chessContract.removeAllListeners();

    chessContract.on("PlayerJoined", (id, opponent) => {
      const currentId = id.toString();
      if (currentId === gameId || currentId === inputGameId) {
        updateStatus(`Player 2 Joined: ${shortAddr(opponent)}! Game On!`, "success");
        fetchGameData(currentId, chessContract); 
      }
    });

    chessContract.on("GameEnded", (id, winner, amount) => {
      if (id.toString() === gameId) {
        updateStatus(`Game Over! Winner: ${shortAddr(winner)} won ${ethers.formatEther(amount)} ETH`, "success");
        setTimeout(() => {
           setGame(new Chess());
           setGameId("");
           setLoserSignature(null);
           setGameData(null);
           setMoveHistory([]);
        }, 5000);
      }
    });
  };

  async function connectWallet() {
    if (typeof window.ethereum === "undefined") return updateStatus("MetaMask Required!", "error");
    
    try {
      setStatusType("loading");
      setStatus("Connecting...");
      
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const newProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await newProvider.getSigner();
      const address = await signer.getAddress();
      const bal = await newProvider.getBalance(address);
      
      setWallet(address);
      setBalance(ethers.formatEther(bal));
      setProvider(newProvider);
      
      const chessContract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      setContract(chessContract);
      setupContractListeners(chessContract);
      
      updateStatus("Wallet Connected.", "success");
    } catch (err) {
      console.error(err);
      updateStatus("Connection Failed.", "error");
    }
  }

  function resetApp() {
    setGameId("");
    setInputGameId("");
    setGame(new Chess());
    setGameData(null);
    setLoserSignature(null);
    setMoveHistory([]);
    updateStatus("App Reset. Ready.", "neutral");
  }

  // --- 3. ACTIONS ---
  async function createGame() {
    if (!contract) return;
    try {
      updateStatus("Confirm Transaction (1 ETH)...", "loading");
      const tx = await contract.createGame({ value: ethers.parseEther("1.0") });
      updateStatus("Mining Transaction...", "loading");
      
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try { return contract.interface.parseLog(log)?.name === "GameCreated"; } 
        catch (e) { return false; }
      });
      
      if (event) {
        const parsedLog = contract.interface.parseLog(event);
        const newGameId = parsedLog.args[0].toString();
        setGameId(newGameId);
        setInputGameId(newGameId);
        fetchGameData(newGameId, contract);
        updateStatus(`Match Created! ID: ${newGameId}`, "success");
      }
    } catch (err) {
      handleError(err);
    }
  }

  async function joinGame() {
    const targetId = inputGameId || gameId;
    if (!contract || !targetId) return updateStatus("Enter Game ID", "error");
    
    try {
      updateStatus(`Joining Game ${targetId}...`, "loading");
      const tx = await contract.joinGame(targetId, { value: ethers.parseEther("1.0") });
      updateStatus("Mining Transaction...", "loading");
      await tx.wait();
      
      setGameId(targetId);
      setInputGameId(targetId); 
      fetchGameData(targetId, contract);
      updateStatus("Match Joined! You are Black.", "success");
    } catch (err) {
      handleError(err);
    }
  }

  async function fetchGameData(id, activeContract) {
    const c = activeContract || contract;
    if (!c) return;
    try {
      const data = await c.getGameInfo(id);
      setGameData({
        p1: data[0],
        p2: data[1],
        wager: data[2],
        active: data[3],
        winner: data[4]
      });
    } catch (err) {
      console.error("Fetch Error", err);
    }
  }

  // --- 4. GAME LOGIC ---
  function onDrop(source, target) {
    if (!gameId) return false;
    try {
      const tempGame = new Chess(game.fen());
      const move = tempGame.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;

      setGame(tempGame);
      setMoveHistory(prev => [...prev, move.san]);
      
      if (tempGame.isCheckmate()) {
        const turn = tempGame.turn(); // 'w' or 'b' - this is the LOSER
        const loserAddr = turn === 'w' ? gameData?.p1 : gameData?.p2;
        
        if (loserAddr && wallet.toLowerCase() === loserAddr.toLowerCase()) {
          updateStatus("Checkmate! You lost. Please sign defeat.", "warning");
        } else {
          updateStatus("Victory! Waiting for opponent to sign...", "success");
        }
      }
      return true;
    } catch (e) { return false; }
  }

  async function signDefeat() {
    if (!gameId) return;
    try {
      updateStatus("Signing Proof of Loss...", "loading");
      const signer = await provider.getSigner(); 
      
      // Ensure type alignment with Solidity (uint256, string)
      const messageHash = ethers.solidityPackedKeccak256(["uint256", "string"], [gameId, "loss"]);
      const messageBytes = ethers.getBytes(messageHash);
      const signature = await signer.signMessage(messageBytes);
      
      setLoserSignature(signature);
      updateStatus("Signed! Please switch account to Winner to claim.", "success");
    } catch (err) {
      handleError(err);
    }
  }

  async function claimPrize() {
    if (!loserSignature) return updateStatus("Missing Signature!", "error");
    try {
      updateStatus("Claiming Prize on Blockchain...", "loading");
      // The signature contains the Loser's authorization. The Winner (msg.sender) submits it.
      const tx = await contract.reportWin(gameId, loserSignature);
      await tx.wait();
      
      updateStatus("Payout Confirmed! Funds Transferred.", "success");
      const bal = await provider.getBalance(wallet);
      setBalance(ethers.formatEther(bal));
    } catch (err) {
      handleError(err);
    }
  }

  function handleError(err) {
    console.error(err);
    let msg = err.reason || err.message || "Unknown Error";
    
    if (msg.includes("insufficient funds")) msg = "Insufficient Funds";
    if (msg.includes("user rejected")) msg = "Transaction Rejected";
    if (msg.includes("Invalid signature")) msg = "Error: Wrong person signed! Loser must sign.";
    
    updateStatus(`${msg}`, "error");
  }

  function updateStatus(msg, type) {
    setStatus(msg);
    setStatusType(type);
  }

  // --- DERIVED STATE & HELPER VARIABLES ---
  const isPlayer1 = gameData?.p1?.toLowerCase() === wallet.toLowerCase();
  const isGameFull = gameData?.p2 && gameData.p2 !== ethers.ZeroAddress;
  const canJoin = wallet && (inputGameId || gameId) && !isPlayer1 && !isGameFull;

  // Determine actual Winner/Loser based on Board State
  let loserAddress = null;
  let winnerAddress = null;
  if (game.isCheckmate()) {
    const loserColor = game.turn(); // 'w' or 'b'
    loserAddress = loserColor === 'w' ? gameData?.p1 : gameData?.p2;
    winnerAddress = loserColor === 'w' ? gameData?.p2 : gameData?.p1;
  }

  const isMyTurnToSign = loserAddress && wallet.toLowerCase() === loserAddress.toLowerCase();
  const isMyTurnToClaim = winnerAddress && wallet.toLowerCase() === winnerAddress.toLowerCase();

  if (!isClient) return null;

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 font-sans selection:bg-indigo-500/30 pb-20">
      
      {/* NAVBAR */}
      <nav className="border-b border-slate-800 bg-[#0B0E14]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={resetApp}>
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20 group-hover:shadow-indigo-500/40 transition-all duration-300">
              <Trophy size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-none">Grandmaster<span className="text-indigo-400">Chain</span></h1>
              <span className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mt-1">Trustless E-Sports</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={resetApp} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-full transition-all" title="Reset">
              <RefreshCw size={18} />
            </button>
            {wallet ? (
              <div className="flex items-center gap-4 bg-slate-900/50 border border-slate-800 pr-6 pl-2 py-1.5 rounded-full">
                <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full">
                  <Wallet size={14} className="text-indigo-400" />
                  <span className="text-xs font-mono font-bold text-white">{parseFloat(balance).toFixed(4)} ETH</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs font-mono text-slate-400">{shortAddr(wallet)}</span>
                </div>
              </div>
            ) : (
              <button onClick={connectWallet} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-lg font-semibold flex items-center gap-2 transition-all">
                <Zap size={18} fill="currentColor" /> Connect Wallet
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* DASHBOARD */}
      <main className="max-w-7xl mx-auto px-6 py-12 flex flex-col lg:flex-row gap-8">
        
        {/* LEFT PANEL */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6">
          
          {/* Status */}
          <div className={`border rounded-2xl p-5 shadow-xl transition-all ${
            statusType === 'error' ? 'bg-red-950/20 border-red-900/50' :
            statusType === 'success' ? 'bg-emerald-950/20 border-emerald-900/50' :
            statusType === 'loading' ? 'bg-indigo-950/20 border-indigo-900/50' :
            'bg-[#151921] border-slate-800'
          }`}>
            <div className="flex items-start gap-4">
              <div className={`mt-1 p-2 rounded-lg ${
                 statusType === 'error' ? 'bg-red-500/10 text-red-400' :
                 statusType === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                 statusType === 'loading' ? 'bg-indigo-500/10 text-indigo-400' :
                 'bg-slate-800 text-slate-400'
              }`}>
                {statusType === 'loading' ? <Loader2 size={18} className="animate-spin"/> : 
                 statusType === 'error' ? <AlertCircle size={18}/> : 
                 statusType === 'success' ? <CheckCircle2 size={18}/> :
                 <Activity size={18}/>}
              </div>
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Live Feed</h2>
                <p className="text-sm font-medium text-slate-200 leading-snug">{status}</p>
              </div>
            </div>
          </div>

          {/* Matchmaking */}
          <div className="bg-[#151921] border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
               <h3 className="text-sm font-bold text-white flex items-center gap-2"><Swords size={16} className="text-indigo-500"/> Matchmaking</h3>
               <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20 font-mono">Wager: 1.0 ETH</span>
            </div>

            <button 
              onClick={createGame}
              disabled={!wallet || gameId}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:grayscale py-4 rounded-xl font-bold text-white shadow-lg transition-all"
            >
              Create Match (Deposit 1 ETH)
            </button>
            
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Game ID..." 
                value={inputGameId}
                onChange={(e) => setInputGameId(e.target.value)}
                className="w-full bg-[#0B0E14] border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:border-indigo-500 outline-none font-mono text-sm"
              />
              <button 
                onClick={joinGame}
                disabled={!canJoin} 
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white px-6 rounded-xl font-bold text-sm transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {isPlayer1 ? "You are P1" : isGameFull ? "Game Full" : "Join"}
              </button>
            </div>

            {gameId && (
               <div className="mt-2 bg-emerald-900/10 border border-emerald-500/20 p-3 rounded-lg flex flex-col gap-2 animate-in fade-in">
                 <div className="flex justify-between items-center">
                   <span className="text-xs text-emerald-400 font-bold uppercase">Active Match</span>
                   <div className="flex items-center gap-2 text-white font-mono font-bold text-sm cursor-pointer hover:text-emerald-300" onClick={() => navigator.clipboard.writeText(gameId)}>
                     ID: {gameId} <Copy size={12}/>
                   </div>
                 </div>
                 {gameData && (
                   <div className="text-[10px] text-slate-400 font-mono grid grid-cols-2 gap-2 mt-1">
                      <div>P1: <span className={gameData.p1.toLowerCase() === wallet.toLowerCase() ? "text-indigo-400" : "text-slate-200"}>{shortAddr(gameData.p1)}</span></div>
                      <div>P2: <span className={gameData.p2 === ethers.ZeroAddress ? "text-slate-500 italic" : "text-slate-200"}>
                        {gameData.p2 === ethers.ZeroAddress ? "Waiting..." : shortAddr(gameData.p2)}
                      </span></div>
                   </div>
                 )}
               </div>
            )}
          </div>

          {/* SETTLEMENT PROTOCOL - STRICT UI CONTROL */}
          {(loserSignature || game.isGameOver()) && (
            <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 border border-amber-500/30 rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center gap-2 mb-4 text-amber-400 font-bold text-sm uppercase tracking-wider">
                <Lock size={16}/> Settlement Protocol
              </div>
              <div className="space-y-3">
                
                {/* BUTTON 1: SIGN DEFEAT */}
                <button 
                  onClick={signDefeat}
                  // ONLY enable if it is MY turn to sign (I am the Loser)
                  disabled={loserSignature || !isMyTurnToSign} 
                  className={`w-full py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                    loserSignature 
                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400 cursor-default" 
                    : isMyTurnToSign
                        ? "bg-amber-500/20 border-amber-500/50 text-amber-200 hover:bg-amber-500/30"
                        : "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed opacity-50"
                  }`}
                >
                  {loserSignature ? <CheckCircle2 size={16}/> : <PenTool size={16}/>}
                  {loserSignature 
                    ? "Step 1: Defeat Signed" 
                    : isMyTurnToSign 
                        ? "Step 1: Sign Defeat (You Lost)" 
                        : "Step 1: Waiting for Loser to Sign..."}
                </button>

                {/* BUTTON 2: CLAIM PRIZE */}
                <button 
                  onClick={claimPrize}
                  // ONLY enable if Signature exists AND I am the Winner
                  disabled={!loserSignature || !isMyTurnToClaim}
                  className={`w-full py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                    (!loserSignature || !isMyTurnToClaim)
                        ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  }`}
                >
                  <Trophy size={16} /> 
                  {isMyTurnToClaim 
                    ? "Step 2: Claim Prize (Winner)" 
                    : "Step 2: Waiting for Winner to Claim"}
                </button>

              </div>
              
              {/* Helper text for local testing */}
              <div className="mt-3 text-[10px] text-center text-slate-500">
                {!loserSignature && !isMyTurnToSign && (
                   <p>Switch MetaMask to the <strong>Loser's account</strong> to sign.</p>
                )}
                {loserSignature && !isMyTurnToClaim && (
                   <p>Switch MetaMask to the <strong>Winner's account</strong> to claim.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* CHESS BOARD */}
        <div className="w-full lg:w-2/3 flex flex-col items-center">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative bg-[#151921] p-4 rounded-2xl border border-slate-700 shadow-2xl">
              <div className="w-[80vw] max-w-[600px] h-[80vw] max-h-[600px] rounded-lg overflow-hidden border border-slate-700/50">
                <Chessboard 
                  position={game.fen()} 
                  onPieceDrop={onDrop}
                  boardOrientation="white" 
                  customDarkSquareStyle={{ backgroundColor: "#312e81" }}
                  customLightSquareStyle={{ backgroundColor: "#cbd5e1" }}
                  customDropSquareStyle={{ boxShadow: 'inset 0 0 1px 6px rgba(99, 102, 241, 0.5)' }}
                  animationDuration={200}
                />
              </div>
            </div>
          </div>
          
          <div className="mt-8 w-full max-w-[600px] bg-[#151921] border border-slate-800 rounded-xl p-4 min-h-[100px]">
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><History size={14}/> Move History</h3>
             <div className="flex flex-wrap gap-2 text-sm font-mono text-slate-400">
               {moveHistory.length > 0 ? moveHistory.map((m, i) => (
                 <span key={i} className={i % 2 === 0 ? "text-white" : "text-slate-500"}>{Math.floor(i/2) + 1}.{m}</span>
               )) : <span className="opacity-30 italic">Moves will appear here...</span>}
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}