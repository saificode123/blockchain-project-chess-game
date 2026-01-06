import React, { useState, useEffect, useRef } from "react";
// We rely on window.ethers and window.Chess via script injection to avoid bundler errors
import { 
  Trophy, Wallet, History, Activity, 
  Copy, CheckCircle2, Loader2, Zap, PenTool, Lock, RefreshCw, Swords, AlertCircle,
  Move, XCircle, ChevronRight, ShieldCheck, Crown, Terminal, Sparkles, LayoutDashboard,
  Box, Skull, ClipboardPaste
} from "lucide-react";

// --- CONTRACT CONFIGURATION ---
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const LOCAL_RPC_URL = "http://127.0.0.1:8545";

// --- UPDATED ABI ---
const CONTRACT_ABI = [
  "function createGame() external payable returns (uint256)",
  "function joinGame(uint256 _gameId) external payable",
  "function makeMove(uint256 _gameId, string calldata _moveSan) external",
  "function reportWin(uint256 _gameId, bytes calldata _signature) external",
  "function resignGame(uint256 _gameId) external",
  "function getGameInfo(uint256 _gameId) external view returns (address p1, address p2, uint256 wager, bool active, address winner)",
  "event GameCreated(uint256 indexed gameId, address indexed creator, uint256 wager)",
  "event PlayerJoined(uint256 indexed gameId, address indexed opponent)",
  "event MoveMade(uint256 indexed gameId, address player, string moveSan)",
  "event GameEnded(uint256 indexed gameId, address indexed winner, uint256 payout)"
];

const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";

// --- STYLES (Kept Original as requested) ---
const styles = `
  @keyframes spin-slow {
    0% { transform: rotateX(0deg) rotateY(0deg); }
    100% { transform: rotateX(360deg) rotateY(360deg); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    50% { transform: translateY(-20px) rotate(5deg); }
  }
  @keyframes floor-move {
    0% { background-position: 0 0; }
    100% { background-position: 0 50px; }
  }
  @keyframes blob {
    0% { transform: translate(0px, 0px) scale(1); }
    33% { transform: translate(30px, -50px) scale(1.1); }
    66% { transform: translate(-20px, 20px) scale(0.9); }
    100% { transform: translate(0px, 0px) scale(1); }
  }
  
  .animate-blob { animation: blob 7s infinite; }
  .animation-delay-2000 { animation-delay: 2s; }
  .animation-delay-4000 { animation-delay: 4s; }
  
  .perspective-container { perspective: 1000px; }
  .preserve-3d { transform-style: preserve-3d; }
  
  .cube-spinner {
    width: 100%; height: 100%;
    position: relative;
    transform-style: preserve-3d;
    animation: spin-slow 12s linear infinite;
  }
  
  .cube-face {
    position: absolute;
    width: 100%; height: 100%;
    border: 1px solid rgba(59, 130, 246, 0.5);
    background: rgba(59, 130, 246, 0.1);
    box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
  }
  
  .face-front  { transform: rotateY(0deg) translateZ(16px); }
  .face-back   { transform: rotateY(180deg) translateZ(16px); }
  .face-right  { transform: rotateY(90deg) translateZ(16px); }
  .face-left   { transform: rotateY(-90deg) translateZ(16px); }
  .face-top    { transform: rotateX(90deg) translateZ(16px); }
  .face-bottom { transform: rotateX(-90deg) translateZ(16px); }

  .infinite-grid {
    background-image: 
      linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
    background-size: 50px 50px;
    transform: perspective(500px) rotateX(60deg);
    animation: floor-move 10s linear infinite;
    mask-image: linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 80%);
  }

  .glass-card-3d {
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }
  .glass-card-3d:hover {
    transform: translateY(-5px) rotateX(2deg);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }

  .floating-gem {
    animation: float 6s ease-in-out infinite;
  }
`;

// --- 3D COMPONENTS ---
const CubeLogo = () => (
  <div className="w-8 h-8 perspective-container mr-3">
    <div className="cube-spinner">
      <div className="cube-face face-front"></div>
      <div className="cube-face face-back"></div>
      <div className="cube-face face-right"></div>
      <div className="cube-face face-left"></div>
      <div className="cube-face face-top"></div>
      <div className="cube-face face-bottom"></div>
      <div className="absolute inset-0 flex items-center justify-center transform preserve-3d" style={{transform: 'translateZ(0px)'}}>
        <div className="w-2 h-2 bg-white rounded-full shadow-[0_0_10px_white] animate-pulse"></div>
      </div>
    </div>
  </div>
);

const BackgroundParticles = () => (
  <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
    <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1586165368502-1bad197a6461?q=80&w=2658&auto=format&fit=crop')] bg-cover bg-center opacity-10 mix-blend-overlay"></div>
    <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob"></div>
    <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full mix-blend-screen filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
  </div>
);

const FloatingGem = ({ delay = "0s", left = "10%", top = "20%", size = "w-16 h-16", color = "bg-blue-500" }) => (
  <div 
    className={`absolute ${left} ${top} ${size} opacity-10 blur-xl rounded-full ${color} floating-gem pointer-events-none z-0`}
    style={{ animationDelay: delay }}
  ></div>
);

// --- CHESSBOARD WITH BLACK & WHITE THEME + OVERLAY ---
const CustomChessboard = ({ game, onMove, orientation = 'white', interactive = true, onGameEndAction, gameEndState, setPastedSignature }) => {
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);

  const pieces = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
  };

  function getBoard() { return game.board(); }

  function handleSquareClick(rowIndex, colIndex) {
    if (!interactive) return;
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    const square = `${files[colIndex]}${ranks[rowIndex]}`;
    
    if (selectedSquare) {
      const moveAttempt = { from: selectedSquare, to: square, promotion: 'q' };
      const result = onMove(moveAttempt); 
      if (result) {
        setSelectedSquare(null);
        setPossibleMoves([]);
      } else {
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
          setSelectedSquare(square);
          setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
        } else {
          setSelectedSquare(null);
          setPossibleMoves([]);
        }
      }
    } else {
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
      }
    }
  }

  const board = getBoard();
  const displayBoard = orientation === 'white' ? board : [...board].reverse().map(row => [...row].reverse());
  const isCheckmate = game.in_checkmate();

  return (
    <div className="w-full aspect-square bg-black rounded-lg overflow-hidden relative shadow-[0_0_50px_rgba(0,0,0,0.5)] ring-4 ring-white/10 z-10">
      
      {/* --- GAME OVER OVERLAY --- */}
      {isCheckmate && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-500 p-6">
          <div className="bg-slate-900 border border-white/20 p-6 rounded-2xl shadow-2xl text-center flex flex-col gap-4 w-full max-w-sm">
             <div className="flex justify-center">
                <Skull size={40} className="text-white"/>
             </div>
             <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Checkmate</h2>
             
             {/* Dynamic Status Text */}
             {gameEndState?.loserSignature ? (
                <p className="text-emerald-400 font-bold text-xs uppercase tracking-widest bg-emerald-500/10 py-2 rounded">
                   Signature Verified
                </p>
             ) : (
                <p className="text-slate-400 font-mono text-xs">
                  {gameEndState.isMyTurnToSign ? "You lost. Authorize payout below." : "Victory! Waiting for authorization."}
                </p>
             )}

             {/* 1. LOSER ACTIONS */}
             {gameEndState?.isMyTurnToSign && !gameEndState?.loserSignature && (
               <button 
                  onClick={onGameEndAction}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-105"
               >
                  <PenTool size={18}/> Sign Defeat (Free)
               </button>
             )}
             
             {gameEndState?.isMyTurnToSign && gameEndState?.loserSignature && (
               <div className="flex flex-col gap-2">
                 <div className="text-[10px] text-slate-400">Sent to winner via sync. Or share manually:</div>
                 <div 
                   onClick={() => navigator.clipboard.writeText(gameEndState.loserSignature)}
                   className="bg-black/50 p-2 rounded text-[8px] font-mono break-all text-slate-500 cursor-pointer hover:text-white"
                 >
                    {gameEndState.loserSignature.slice(0, 40)}...
                 </div>
               </div>
             )}

             {/* 2. WINNER ACTIONS */}
             {gameEndState?.isMyTurnToClaim && (
               <div className="w-full flex flex-col gap-3">
                 {gameEndState?.loserSignature ? (
                    <button 
                      onClick={onGameEndAction}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-105 animate-pulse w-full"
                    >
                        <Trophy size={18}/> Claim Reward
                    </button>
                 ) : (
                    <div className="w-full">
                       <div className="flex items-center gap-2 text-yellow-500 bg-yellow-500/10 px-4 py-3 rounded-lg border border-yellow-500/20 mb-2">
                          <Loader2 size={16} className="animate-spin flex-shrink-0"/>
                          <span className="text-[10px] font-bold uppercase leading-tight">Waiting for opponent to sign...</span>
                       </div>
                       
                       {/* MANUAL INPUT FALLBACK */}
                       <div className="relative group">
                          <input 
                            type="text" 
                            placeholder="Or paste signature here..."
                            onChange={(e) => setPastedSignature(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none font-mono"
                          />
                          <ClipboardPaste size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"/>
                       </div>
                    </div>
                 )}
               </div>
             )}
          </div>
        </div>
      )}

      {/* --- BOARD GRID (BLACK & WHITE) --- */}
      <div className="w-full h-full grid grid-cols-8 grid-rows-8">
      {displayBoard.map((row, rIdx) => 
        row.map((piece, cIdx) => {
          const actualR = orientation === 'white' ? rIdx : 7 - rIdx;
          const actualC = orientation === 'white' ? cIdx : 7 - cIdx;
          const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
          const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
          const square = `${files[actualC]}${ranks[actualR]}`;
          
          const isDark = (actualR + actualC) % 2 === 1;
          const isSelected = selectedSquare === square;
          const isPossibleMove = possibleMoves.includes(square);
          const history = game.history({ verbose: true });
          const lastMove = history.length > 0 ? history[history.length - 1] : null;
          const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);

          return (
            <div 
              key={`${rIdx}-${cIdx}`}
              onClick={() => handleSquareClick(actualR, actualC)}
              className={`
                relative flex items-center justify-center text-4xl sm:text-5xl cursor-pointer transition-all duration-100
                ${isDark ? 'bg-black' : 'bg-white'} 
                ${isSelected ? '!bg-amber-400' : ''}
                ${isLastMove && !isSelected ? 'after:absolute after:inset-0 after:bg-blue-500/20' : ''}
              `}
            >
               {/* Coords */}
               {actualC === 0 && <span className={`absolute top-0.5 left-1 text-[8px] font-bold ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{ranks[actualR]}</span>}
               {actualR === 7 && <span className={`absolute bottom-0 right-1 text-[8px] font-bold ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>{files[actualC]}</span>}
               
               {/* Move Dot */}
               {isPossibleMove && (
                <div className={`absolute w-3 h-3 rounded-full ${piece ? 'bg-red-500 ring-2 ring-red-200' : 'bg-slate-400/50'} z-20`}></div>
               )}

               {/* Pieces */}
               <span className={`z-30 select-none font-serif ${isSelected ? 'scale-110' : ''}
                 ${piece?.color === 'w' 
                   ? 'text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.9)]' 
                   : 'text-black drop-shadow-[0_0_1px_rgba(255,255,255,1)]'}
               `}>
                 {piece ? pieces[piece.color][piece.type] : ""}
               </span>
            </div>
          );
        })
      )}
      </div>
    </div>
  );
};

export default function AdvancedChessPlatform() {
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [game, setGame] = useState(null); 
  const [wallet, setWallet] = useState("");
  const [balance, setBalance] = useState("0.0");
  const [readContract, setReadContract] = useState(null);
  const [writeContract, setWriteContract] = useState(null);
  const [browserProvider, setBrowserProvider] = useState(null);
  const [gameId, setGameId] = useState("");
  const [gameData, setGameData] = useState(null);
  
  // STATE: Signature
  const [loserSignature, setLoserSignature] = useState(null); 
  const [pastedSignature, setPastedSignature] = useState("");

  const [inputGameId, setInputGameId] = useState("");
  const [status, setStatus] = useState("Initializing System...");
  const [statusType, setStatusType] = useState("loading"); 
  const [moveHistory, setMoveHistory] = useState([]);

  // Refs
  const walletRef = useRef(wallet);
  const gameIdRef = useRef(gameId);
  const gameDataRef = useRef(gameData);

  useEffect(() => { walletRef.current = wallet; }, [wallet]);
  useEffect(() => { gameIdRef.current = gameId; }, [gameId]);
  useEffect(() => { gameDataRef.current = gameData; }, [gameData]);

  // --- SIGNATURE SYNC (LOCALSTORAGE WATCHER) ---
  // This allows 2 browser tabs on the same machine to share the signature instantly
  useEffect(() => {
    if (!gameId) return;

    const checkStorage = () => {
      const storedSig = localStorage.getItem(`chess_sig_${gameId}`);
      if (storedSig && !loserSignature) {
        setLoserSignature(storedSig);
        updateStatus("Signature Received via Sync.", "success");
      }
    };

    // Check every second (polling is simpler than storage events for some browsers)
    const interval = setInterval(checkStorage, 1000);
    return () => clearInterval(interval);
  }, [gameId, loserSignature]);

  // --- MANUAL SIGNATURE INPUT ---
  useEffect(() => {
    if (pastedSignature && pastedSignature.startsWith("0x") && pastedSignature.length > 100) {
       setLoserSignature(pastedSignature);
       updateStatus("Signature Manually Applied.", "success");
    }
  }, [pastedSignature]);
  
  // Inject styles
  useEffect(() => {
    const styleSheet = document.createElement("style");
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
    return () => document.head.removeChild(styleSheet);
  }, []);

  useEffect(() => {
    const loadScript = (src) => {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    };

    const initLibs = async () => {
      try {
        if (!window.ethers) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/ethers/6.11.1/ethers.umd.min.js");
        if (!window.Chess) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js");
        setGame(new window.Chess());
        setLibsLoaded(true);
        setStatus("System Online. Connecting to Network...");
      } catch (err) {
        setStatus("Connection Error. Check Uplink.");
        setStatusType("error");
      }
    };
    initLibs();
  }, []);

  useEffect(() => {
    if (!libsLoaded || !window.ethers) return;
    const initReadProvider = async () => {
      try {
        const rProvider = new window.ethers.JsonRpcProvider(LOCAL_RPC_URL);
        const rContract = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rProvider);
        setReadContract(rContract);
        setupContractListeners(rContract);
        updateStatus("Read-Only Node Synced. Awaiting Wallet.", "neutral");
      } catch (err) {
        console.error("Local Node Connection Failed:", err);
        updateStatus("Error: Local Hardhat Node unreachable.", "error");
      }
    };
    initReadProvider();
    // eslint-disable-next-line
  }, [libsLoaded]);

  useEffect(() => {
    if (typeof window.ethereum === "undefined" || !libsLoaded) return;
    const handleAccountsChanged = async (newAccounts) => {
      if (newAccounts.length > 0) {
        const newWallet = newAccounts[0];
        setWallet(newWallet);
        const newBrowserProvider = new window.ethers.BrowserProvider(window.ethereum);
        const newSigner = await newBrowserProvider.getSigner();
        const newWriteContract = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, newSigner);
        setBrowserProvider(newBrowserProvider);
        setWriteContract(newWriteContract);
        const newBal = await newBrowserProvider.getBalance(newWallet);
        setBalance(window.ethers.formatEther(newBal));
        updateStatus(`Identity Verified: ${shortAddr(newWallet)}`, "neutral");
        if (gameId && readContract) fetchGameData(gameId, readContract);
      } else {
        setWallet("");
        setWriteContract(null);
        updateStatus("Wallet Disconnected", "warning");
      }
    };
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    return () => window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
  }, [gameId, libsLoaded, readContract]);

  const setupContractListeners = (contractInstance) => {
    contractInstance.removeAllListeners();
    contractInstance.on("PlayerJoined", (id, opponent) => {
      if (id.toString() !== gameIdRef.current) return;
      updateStatus(`Challenger Approaching: ${shortAddr(opponent)}`, "success");
      fetchGameData(id.toString(), contractInstance); 
    });
    contractInstance.on("MoveMade", (id, player, moveSan) => {
      if (id.toString() !== gameIdRef.current) return;
      const myAddress = walletRef.current;
      if (player.toLowerCase() === myAddress.toLowerCase()) return;
      setGame((prevGame) => {
        const nextGame = new window.Chess(prevGame.fen());
        const result = nextGame.move(moveSan);
        if (result) {
          setMoveHistory(prev => [...prev, moveSan]);
          if (nextGame.in_checkmate()) {
             updateStatus("Checkmate! Game Over.", "warning");
          } else if (nextGame.in_check()) {
            updateStatus("WARNING: King is in Check!", "warning");
          } else {
            updateStatus(`Opponent Moved: ${moveSan}. Your Turn.`, "neutral");
          }
          return nextGame;
        }
        return prevGame;
      });
    });
    contractInstance.on("GameEnded", (id, winner, amount) => {
      if (id.toString() !== gameIdRef.current) return;
      updateStatus(`Match Concluded. Winner: ${shortAddr(winner)} (${window.ethers.formatEther(amount)} ETH)`, "success");
      setTimeout(() => resetApp(false), 5000); 
    });
  };

  async function connectWallet() {
    if (!libsLoaded) return;
    if (typeof window.ethereum === "undefined") return updateStatus("MetaMask Required!", "error");
    try {
      setStatusType("loading");
      setStatus("Establishing Secure Connection...");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const newBrowserProvider = new window.ethers.BrowserProvider(window.ethereum);
      const signer = await newBrowserProvider.getSigner();
      const address = await signer.getAddress();
      const bal = await newBrowserProvider.getBalance(address);
      setWallet(address);
      setBalance(window.ethers.formatEther(bal));
      setBrowserProvider(newBrowserProvider);
      setWriteContract(new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
      updateStatus("Wallet Connected Successfully.", "success");
    } catch (err) {
      updateStatus("Connection Denied by User.", "error");
    }
  }

  function resetApp(full = true) {
    if (full) setInputGameId("");
    setGameId("");
    setGame(new window.Chess());
    setGameData(null);
    setLoserSignature(null);
    setMoveHistory([]);
    setPastedSignature("");
    if (full) updateStatus("System Reset. Ready.", "neutral");
  }

  async function getOverrideOptions() {
    const tempProvider = new window.ethers.JsonRpcProvider(LOCAL_RPC_URL);
    const nonce = await tempProvider.getTransactionCount(wallet, "latest");
    return { nonce: nonce, gasLimit: 1000000 };
  }

  async function createGame() {
    if (!writeContract) return updateStatus("Wallet Not Connected", "error");
    try {
      updateStatus("Initiating Contract (1.0 ETH)...", "loading");
      const overrides = await getOverrideOptions();
      const tx = await writeContract.createGame({ 
        value: window.ethers.parseEther("1.0"),
        ...overrides
      });
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try { return writeContract.interface.parseLog(log)?.name === "GameCreated"; } 
        catch (e) { return false; }
      });
      if (event) {
        const parsedLog = writeContract.interface.parseLog(event);
        const newGameId = parsedLog.args[0].toString();
        setGameId(newGameId);
        setInputGameId(newGameId);
        fetchGameData(newGameId);
        updateStatus(`Lobby Created. ID: ${newGameId}`, "success");
      }
    } catch (err) { handleError(err); }
  }

  async function joinGame() {
    const targetId = inputGameId || gameId;
    if (!writeContract || !targetId) return updateStatus("Invalid Game ID", "error");
    try {
      updateStatus(`Syncing with Game ${targetId}...`, "loading");
      const overrides = await getOverrideOptions();
      const tx = await writeContract.joinGame(targetId, { 
        value: window.ethers.parseEther("1.0"),
        ...overrides
      });
      await tx.wait();
      setGameId(targetId);
      setInputGameId(targetId); 
      fetchGameData(targetId);
      updateStatus("Match Joined. You command Black.", "success");
    } catch (err) { handleError(err); }
  }

  async function fetchGameData(id, specificContract = null) {
    const c = specificContract || readContract;
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
    } catch (err) { console.error("Fetch Error:", err); }
  }

  async function onMove(moveObj) {
    if (!gameId || !writeContract) return false;
    try {
      const tempGame = new window.Chess(game.fen());
      const move = tempGame.move(moveObj);
      if (!move) return false;

      setGame(tempGame);
      setMoveHistory(prev => [...prev, move.san]);

      const overrides = await getOverrideOptions();
      writeContract.makeMove(gameId, move.san, overrides).catch(err => {
         console.error("Move broadcast failed:", err);
         updateStatus("Network Error: Move not broadcasted!", "error");
      });

      if (tempGame.in_checkmate()) { 
        const turn = tempGame.turn(); 
        const loserAddr = turn === 'w' ? gameData?.p1 : gameData?.p2;
        if (loserAddr && wallet.toLowerCase() === loserAddr.toLowerCase()) {
          updateStatus("Checkmate Detected. Sign Defeat to authorize payout.", "warning");
        } else {
          updateStatus("Victory. Awaiting Opponent Signature.", "success");
        }
      }
      return true;
    } catch (e) { return false; }
  }

  async function signDefeat() {
    if (!gameId || !browserProvider) return;
    try {
      updateStatus("Generating Cryptographic Proof of Loss...", "loading");
      const signer = await browserProvider.getSigner(); 
      const messageHash = window.ethers.solidityPackedKeccak256(["uint256", "string"], [gameId, "loss"]);
      const messageBytes = window.ethers.getBytes(messageHash);
      const signature = await signer.signMessage(messageBytes);
      
      setLoserSignature(signature);
      // SYNC: Save to localStorage for local testing convenience
      localStorage.setItem(`chess_sig_${gameId}`, signature);
      
      updateStatus("Proof Signed & Synced. Winner may now claim.", "success");
    } catch (err) { handleError(err); }
  }

  async function claimPrize() {
    if (!loserSignature || !writeContract) return updateStatus("Unauthorized or No Signature", "error");
    try {
      updateStatus("Executing Smart Contract Payout...", "loading");
      const overrides = await getOverrideOptions();
      const tx = await writeContract.reportWin(gameId, loserSignature, overrides);
      await tx.wait();
      updateStatus("Transfer Complete. Funds Secured.", "success");
      const bal = await browserProvider.getBalance(wallet);
      setBalance(window.ethers.formatEther(bal));
      // Cleanup
      localStorage.removeItem(`chess_sig_${gameId}`);
    } catch (err) { handleError(err); }
  }

  function handleError(err) {
    console.error(err);
    let msg = err.reason || err.message || "Unknown Error";
    if (msg.includes("insufficient funds")) msg = "Insufficient Funds";
    if (msg.includes("user rejected")) msg = "Transaction Rejected";
    updateStatus(`${msg}`, "error");
  }

  function updateStatus(msg, type) {
    setStatus(msg);
    setStatusType(type);
  }

  const isPlayer1 = gameData?.p1?.toLowerCase() === wallet.toLowerCase();
  const isGameFull = gameData?.p2 && gameData.p2 !== window.ethers.ZeroAddress;
  const canJoin = wallet && (inputGameId || gameId) && !isPlayer1 && !isGameFull;
  
  let loserAddress = null, winnerAddress = null;
  if (game && game.in_checkmate()) {
    const loserColor = game.turn();
    loserAddress = loserColor === 'w' ? gameData?.p1 : gameData?.p2;
    winnerAddress = loserColor === 'w' ? gameData?.p2 : gameData?.p1;
  }
  const isMyTurnToSign = loserAddress && wallet.toLowerCase() === loserAddress.toLowerCase();
  const isMyTurnToClaim = winnerAddress && wallet.toLowerCase() === winnerAddress.toLowerCase();

  const gameEndState = { isMyTurnToSign, isMyTurnToClaim, loserSignature, winnerAddress };
  const onGameEndAction = isMyTurnToSign ? signDefeat : claimPrize;

  if (!libsLoaded) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><Loader2 className="animate-spin text-white" size={48}/></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 text-slate-100 font-sans relative overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none flex items-end justify-center z-0 perspective-container">
          <div className="w-[200vw] h-[100vh] infinite-grid origin-bottom opacity-20"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-slate-900"></div>
      </div>

      <BackgroundParticles />
      <FloatingGem delay="0s" left="10%" top="15%" color="bg-blue-600" size="w-32 h-32" />

      {/* NAVBAR */}
      <nav className="border-b border-white/10 bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50 transition-all duration-300 shadow-lg">
        <div className="max-w-[1400px] mx-auto px-6 h-24 flex justify-between items-center">
          <div className="flex items-center group cursor-pointer select-none" onClick={() => resetApp(true)}>
            <CubeLogo />
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold text-white tracking-tight leading-none text-shadow-lg">
                GRANDMASTER<span className="text-blue-400">CHAIN</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Live Mainnet</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => resetApp(true)} className="p-3 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-all duration-200 transform hover:rotate-180" title="Hard Reset">
              <RefreshCw size={20} />
            </button>
            {wallet ? (
              <div className="flex items-center gap-5 bg-slate-800/80 border border-white/10 pr-6 pl-2 py-2 rounded-full shadow-xl backdrop-blur-md">
                <div className="flex items-center gap-2 bg-slate-900 border border-white/5 px-4 py-2 rounded-full shadow-inner">
                  <Wallet size={16} className="text-blue-400" />
                  <span className="text-sm font-mono font-bold text-white tracking-tight">{parseFloat(balance).toFixed(4)} ETH</span>
                </div>
                <div className="flex items-center gap-3">
                   <div className="flex flex-col items-end leading-none">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Connected</span>
                      <span className="text-xs font-mono text-slate-200 font-medium tracking-wide">{shortAddr(wallet)}</span>
                   </div>
                   <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white border-2 border-slate-700 shadow-md">
                      {wallet.slice(2,4).toUpperCase()}
                   </div>
                </div>
              </div>
            ) : (
              <button 
                onClick={connectWallet} 
                className="relative px-8 py-3 rounded-full font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(37,99,235,0.4)] border border-blue-400/20 overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <span className="relative flex items-center gap-2"><Zap size={18} fill="currentColor" /> Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-[1400px] mx-auto px-6 py-12 flex flex-col lg:flex-row gap-10 relative z-10">
        
        {/* LEFT PANEL */}
        <div className="w-full lg:w-[420px] flex flex-col gap-6">
          <div className="glass-card-3d bg-slate-800/60 backdrop-blur-md border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
             <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full blur-xl"></div>
              <div className="flex items-center gap-4 relative z-10">
                <div className={`p-3 rounded-xl shadow-lg border border-white/10 ${
                   statusType === 'error' ? 'bg-red-500/20 text-red-400' :
                   statusType === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                   'bg-blue-500/20 text-blue-400'
                }`}>
                  {statusType === 'loading' ? <Loader2 size={24} className="animate-spin"/> : 
                   statusType === 'error' ? <AlertCircle size={24}/> : 
                   statusType === 'success' ? <CheckCircle2 size={24}/> :
                   <Activity size={24}/>}
                </div>
                <div>
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-2">System Feed</h2>
                  <p className="text-sm font-semibold text-white leading-snug">{status}</p>
                </div>
              </div>
          </div>

          <div className="glass-card-3d bg-slate-800/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col gap-8 relative overflow-hidden group">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1529699211952-734e80c4d42b?q=80&w=2671&auto=format&fit=crop')] bg-cover bg-center opacity-20 mix-blend-overlay transition-opacity duration-500 group-hover:opacity-30"></div>
            
            <div className="relative z-10 border-b border-white/10 pb-6">
               <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center gap-2"><LayoutDashboard size={20} className="text-blue-400"/> Game Lobby</h3>
                    <p className="text-xs text-slate-400 mt-1">Select your wager and start playing.</p>
                  </div>
                  <div className="flex flex-col items-end">
                     <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-1">Standard Stake</span>
                     <span className="text-xl font-mono font-bold text-white tracking-tight drop-shadow-md">1.0 ETH</span>
                  </div>
               </div>
            </div>

            <div className="space-y-4 relative z-10">
                <button 
                  onClick={createGame}
                  disabled={!wallet || gameId}
                  className="w-full group bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-4 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_5px_20px_rgba(37,99,235,0.3)] transition-all flex items-center justify-between px-6 transform hover:-translate-y-1"
                >
                    <span className="flex items-center gap-2 text-sm uppercase tracking-wide"><Swords size={18} /> Create New Match</span>
                    <div className="bg-white/20 p-1 rounded-full group-hover:bg-white/30 transition-colors">
                      <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform"/>
                    </div>
                </button>
                
                <div className="relative flex items-center py-2">
                   <div className="h-px bg-white/10 flex-1"></div>
                   <span className="px-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest">OR JOIN EXISTING</span>
                   <div className="h-px bg-white/10 flex-1"></div>
                </div>

                <div className="flex gap-3">
                  <div className="relative flex-1 group/input">
                    <input 
                      type="text" 
                      placeholder="Input Game ID..." 
                      value={inputGameId}
                      onChange={(e) => setInputGameId(e.target.value)}
                      className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono text-sm transition-all focus:bg-slate-900"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within/input:text-blue-400 transition-colors"><Terminal size={14}/></div>
                  </div>
                  <button onClick={joinGame} disabled={!canJoin} className="bg-slate-700 hover:bg-slate-600 border border-white/5 text-white px-8 rounded-xl font-bold text-sm transition-all disabled:opacity-50 shadow-md">Join Game</button>
                </div>
            </div>

            {gameId && (
               <div className="relative z-10 bg-slate-900/80 border border-emerald-500/30 p-5 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 shadow-inner ring-1 ring-emerald-500/20">
                 <div className="flex justify-between items-center border-b border-white/5 pb-3">
                   <div className="flex items-center gap-2 text-emerald-400">
                      <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Session Active</span>
                   </div>
                   <button onClick={() => navigator.clipboard.writeText(gameId)} className="flex items-center gap-2 text-slate-400 hover:text-white font-mono font-bold text-[10px] bg-white/5 px-2 py-1 rounded hover:bg-white/10 transition-colors">ID: {gameId.slice(0,8)}... <Copy size={12}/></button>
                 </div>
                 {gameData && (
                   <div className="space-y-3">
                      <div className={`flex justify-between items-center p-3 rounded-lg border transition-all ${gameData.p1.toLowerCase() === wallet.toLowerCase() ? "bg-blue-500/10 border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.1)]" : "bg-white/5 border-white/5"}`}>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-black font-bold text-xs shadow-md">P1</div>
                            <span className="text-xs font-bold text-slate-300">White</span>
                        </div>
                        <span className="text-xs font-mono text-white bg-black/20 px-2 py-1 rounded border border-white/5">{shortAddr(gameData.p1)}</span>
                      </div>
                      <div className={`flex justify-between items-center p-3 rounded-lg border transition-all ${gameData.p2 !== window.ethers.ZeroAddress ? "bg-white/5 border-white/5" : "bg-white/5 border-dashed border-white/10"}`}>
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-600 flex items-center justify-center text-white font-bold text-xs shadow-md">P2</div>
                            <span className="text-xs font-bold text-slate-300">Black</span>
                        </div>
                        <span className="text-xs font-mono text-white bg-black/20 px-2 py-1 rounded border border-white/5">{gameData.p2 !== window.ethers.ZeroAddress ? shortAddr(gameData.p2) : "WAITING..."}</span>
                      </div>
                   </div>
                 )}
               </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: IMMERSIVE BOARD */}
        <div className="w-full lg:flex-1 flex flex-col items-center relative z-10 perspective-container">
          <div className="relative group w-full max-w-[700px] transform transition-transform duration-700 hover:rotate-x-1">
            <div className="relative bg-slate-800 p-2 rounded-2xl border border-white/10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.6)]">
              <div className="bg-[#1e293b] rounded-xl p-8 border border-white/5 shadow-inner relative">
                 <div className="w-full rounded-lg overflow-hidden border-[8px] border-slate-900 shadow-2xl relative z-10">
                   <CustomChessboard 
                     game={game} 
                     onMove={onMove}
                     orientation={(!isPlayer1 && gameId) ? 'black' : 'white'}
                     onGameEndAction={onGameEndAction}
                     gameEndState={gameEndState}
                     setPastedSignature={setPastedSignature}
                   />
                 </div>
              </div>
            </div>
          </div>
          
          <div className="mt-8 w-full max-w-[700px] bg-slate-800/80 backdrop-blur-md border border-white/10 rounded-2xl p-6 min-h-[140px] shadow-lg flex flex-col relative overflow-hidden glass-card-3d">
             <div className="flex justify-between items-center mb-4 relative z-10 border-b border-white/5 pb-2">
               <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2"><Terminal size={14} className="text-blue-400"/> Game Ledger</h3>
               <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div>
                 <span className="text-[10px] font-mono text-slate-400">LIVE SYNC</span>
               </div>
             </div>
             
             <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-mono relative z-10 max-h-32 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent">
               {moveHistory.length > 0 ? moveHistory.map((m, i) => (
                 <div key={i} className="flex gap-3 min-w-[4rem] items-center">
                   <span className="text-slate-500 select-none text-[10px] w-4 text-right">{Math.ceil((i+1)/2)}.</span>
                   <span className={`px-2 py-0.5 rounded transition-all ${i % 2 === 0 ? "bg-white/10 text-white font-bold shadow-sm" : "text-slate-300"}`}>{m}</span>
                 </div>
               )) : (
                 <div className="w-full h-20 flex flex-col items-center justify-center opacity-40 text-slate-400">
                   <Sparkles size={20} className="mb-2"/>
                   <span className="text-xs font-medium">Waiting for match start...</span>
                 </div>
               )}
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}