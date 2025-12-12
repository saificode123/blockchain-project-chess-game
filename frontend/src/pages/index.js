import React, { useState, useEffect, useRef } from "react";
// We rely on window.ethers and window.Chess via script injection to avoid bundler errors
import { 
  Trophy, Wallet, History, Activity, 
  Copy, CheckCircle2, Loader2, Zap, PenTool, Lock, RefreshCw, Swords, AlertCircle,
  Move, XCircle
} from "lucide-react";

// --- CONTRACT CONFIGURATION ---
const CONTRACT_ADDRESS = "0x5fbdb2315678afecb367f032d93f642f64180aa3";
const LOCAL_RPC_URL = "http://127.0.0.1:8545";

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

// --- CUSTOM CHESSBOARD COMPONENT ---
// Implemented manually to avoid 'react-chessboard' dependency issues in this environment
const CustomChessboard = ({ game, onMove, orientation = 'white', interactive = true }) => {
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [possibleMoves, setPossibleMoves] = useState([]);

  // Unicode Chess Pieces
  const pieces = {
    w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
    b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" }
  };

  function getBoard() {
    return game.board(); // Returns 8x8 array or nulls
  }

  function handleSquareClick(rowIndex, colIndex) {
    if (!interactive) return;

    // Convert row/col to algebraic notation (e.g., 6,4 -> "e2")
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    const square = `${files[colIndex]}${ranks[rowIndex]}`;
    
    // If we already have a selected square, try to move
    if (selectedSquare) {
      const moveAttempt = { from: selectedSquare, to: square, promotion: 'q' };
      const result = onMove(moveAttempt); // Try move in parent
      
      if (result) {
        // Move successful
        setSelectedSquare(null);
        setPossibleMoves([]);
      } else {
        // Move failed. If clicked on own piece, change selection. Else deselect.
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
      // No selection - try to select a piece
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) {
        setSelectedSquare(square);
        setPossibleMoves(game.moves({ square, verbose: true }).map(m => m.to));
      }
    }
  }

  const board = getBoard();
  // If orientation is black, reverse the board for rendering
  const displayBoard = orientation === 'white' ? board : [...board].reverse().map(row => [...row].reverse());

  return (
    <div className="w-full aspect-square bg-slate-800 border-4 border-slate-700 rounded-lg select-none overflow-hidden grid grid-cols-8 grid-rows-8">
      {displayBoard.map((row, rIdx) => 
        row.map((piece, cIdx) => {
          // Adjust indices if board is flipped
          const actualR = orientation === 'white' ? rIdx : 7 - rIdx;
          const actualC = orientation === 'white' ? cIdx : 7 - cIdx;
          
          const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
          const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
          const square = `${files[actualC]}${ranks[actualR]}`;
          
          const isDark = (actualR + actualC) % 2 === 1;
          const isSelected = selectedSquare === square;
          const isPossibleMove = possibleMoves.includes(square);
          const isLastMove = game.history({ verbose: true }).length > 0 && 
            (game.history({ verbose: true }).slice(-1)[0].from === square || 
             game.history({ verbose: true }).slice(-1)[0].to === square);

          return (
            <div 
              key={`${rIdx}-${cIdx}`}
              onClick={() => handleSquareClick(actualR, actualC)}
              className={`
                relative flex items-center justify-center text-4xl cursor-pointer transition-all
                ${isDark ? 'bg-[#312e81]' : 'bg-[#cbd5e1]'}
                ${isSelected ? '!bg-indigo-500 ring-inset ring-4 ring-indigo-300' : ''}
                ${isLastMove ? 'after:content-[""] after:absolute after:inset-0 after:bg-yellow-400/30' : ''}
              `}
            >
              {/* Coordinate Labels (Optional styling for corners) */}
              {actualC === 0 && <span className={`absolute top-0 left-1 text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{ranks[actualR]}</span>}
              {actualR === 7 && <span className={`absolute bottom-0 right-1 text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{files[actualC]}</span>}

              {/* Move Indicator */}
              {isPossibleMove && (
                <div className={`absolute w-3 h-3 rounded-full ${piece ? 'bg-red-500/50 ring-2 ring-red-500' : 'bg-green-500/50'} z-10`}></div>
              )}

              {/* Piece */}
              <span className={`z-20 drop-shadow-md transform transition-transform hover:scale-110 ${
                piece?.color === 'w' ? 'text-white stroke-black' : 'text-black'
              }`}>
                {piece ? pieces[piece.color][piece.type] : ""}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
};

export default function AdvancedChessPlatform() {
  // --- STATE ---
  const [libsLoaded, setLibsLoaded] = useState(false);
  const [game, setGame] = useState(null); // Will hold Chess instance
  const [wallet, setWallet] = useState("");
  const [balance, setBalance] = useState("0.0");
  
  // --- HYBRID PROVIDER STATE ---
  const [readContract, setReadContract] = useState(null);
  const [writeContract, setWriteContract] = useState(null);
  const [browserProvider, setBrowserProvider] = useState(null);
  
  const [gameId, setGameId] = useState("");
  const [gameData, setGameData] = useState(null);
  const [loserSignature, setLoserSignature] = useState(null); 
  const [inputGameId, setInputGameId] = useState("");
  const [status, setStatus] = useState("Loading Libraries...");
  const [statusType, setStatusType] = useState("loading"); 
  const [moveHistory, setMoveHistory] = useState([]);
  
  // --- 0. SCRIPT INJECTION ---
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
        setStatus("System Ready. Connecting to Network...");
      } catch (err) {
        setStatus("Error loading dependencies. Check internet.");
        setStatusType("error");
      }
    };
    initLibs();
  }, []);

  // --- 1. INITIALIZATION (Read Provider) ---
  useEffect(() => {
    if (!libsLoaded || !window.ethers) return;

    const initReadProvider = async () => {
      try {
        // Direct connection to Hardhat Node (127.0.0.1:8545)
        const rProvider = new window.ethers.JsonRpcProvider(LOCAL_RPC_URL);
        const rContract = new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, rProvider);
        
        setReadContract(rContract);
        setupContractListeners(rContract);
        updateStatus("System Ready (Read-Only). Connect Wallet.", "neutral");
      } catch (err) {
        console.error("Local Node Connection Failed:", err);
        updateStatus("Error: Hardhat Node not found at 127.0.0.1:8545", "error");
      }
    };
    initReadProvider();
    return () => { if (readContract) readContract.removeAllListeners(); };
  }, [libsLoaded]);

  // --- 2. HANDLE WALLET ---
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
        updateStatus(`Switched to: ${shortAddr(newWallet)}`, "neutral");

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

  // --- 3. EVENT LISTENERS ---
  const setupContractListeners = (contractInstance) => {
    contractInstance.removeAllListeners();
    contractInstance.on("PlayerJoined", (id, opponent) => {
      updateStatus(`Player 2 Joined: ${shortAddr(opponent)}!`, "success");
      fetchGameData(id.toString(), contractInstance); 
    });
    contractInstance.on("GameEnded", (id, winner, amount) => {
      updateStatus(`Game Over! Winner: ${shortAddr(winner)} won ${window.ethers.formatEther(amount)} ETH`, "success");
      setTimeout(() => resetApp(false), 5000); // Soft reset
    });
  };

  // --- ACTIONS ---
  async function connectWallet() {
    if (!libsLoaded) return;
    if (typeof window.ethereum === "undefined") return updateStatus("MetaMask Required!", "error");
    
    try {
      setStatusType("loading");
      setStatus("Connecting...");
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      const newBrowserProvider = new window.ethers.BrowserProvider(window.ethereum);
      const signer = await newBrowserProvider.getSigner();
      const address = await signer.getAddress();
      const bal = await newBrowserProvider.getBalance(address);
      
      setWallet(address);
      setBalance(window.ethers.formatEther(bal));
      setBrowserProvider(newBrowserProvider);
      setWriteContract(new window.ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer));
      
      updateStatus("Wallet Connected.", "success");
    } catch (err) {
      updateStatus("Connection Failed.", "error");
    }
  }

  function resetApp(full = true) {
    if (full) setInputGameId("");
    setGameId("");
    setGame(new window.Chess());
    setGameData(null);
    setLoserSignature(null);
    setMoveHistory([]);
    if (full) updateStatus("App Reset. Ready.", "neutral");
  }

  // --- HELPER TO BYPASS METAMASK CACHE FOR NONCE ---
  async function getOverrideOptions() {
    // 1. Connect directly to local node
    const tempProvider = new window.ethers.JsonRpcProvider(LOCAL_RPC_URL);
    // 2. Get correct nonce from local node
    const nonce = await tempProvider.getTransactionCount(wallet, "latest");
    // 3. Return overrides: nonce + gasLimit to skip estimateGas
    return {
      nonce: nonce,
      gasLimit: 500000 // Arbitrary high limit to skip estimation checks
    };
  }

  async function createGame() {
    if (!writeContract) return updateStatus("Connect Wallet First", "error");
    try {
      updateStatus("Confirm Tx (1 ETH)...", "loading");
      
      // FIX: Force Nonce and GasLimit to bypass Metamask Checks
      const overrides = await getOverrideOptions();
      const tx = await writeContract.createGame({ 
        value: window.ethers.parseEther("1.0"),
        ...overrides
      });
      
      updateStatus("Mining...", "loading");
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
        updateStatus(`Match Created! ID: ${newGameId}`, "success");
      }
    } catch (err) { handleError(err); }
  }

  async function joinGame() {
    const targetId = inputGameId || gameId;
    if (!writeContract || !targetId) return updateStatus("Enter Game ID", "error");
    try {
      updateStatus(`Joining Game ${targetId}...`, "loading");
      
      // FIX: Force Nonce and GasLimit to bypass Metamask Checks
      const overrides = await getOverrideOptions();
      const tx = await writeContract.joinGame(targetId, { 
        value: window.ethers.parseEther("1.0"),
        ...overrides
      });
      
      updateStatus("Mining...", "loading");
      await tx.wait();
      
      setGameId(targetId);
      setInputGameId(targetId); 
      fetchGameData(targetId);
      updateStatus("Match Joined! You are Black.", "success");
    } catch (err) { handleError(err); }
  }

  async function fetchGameData(id, specificContract = null) {
    const c = specificContract || readContract;
    if (!c) return;
    try {
      // READS bypass Metamask, going straight to Localhost via JsonRpcProvider
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

  function onMove(moveObj) {
    if (!gameId) return false;
    try {
      const tempGame = new window.Chess(game.fen());
      const move = tempGame.move(moveObj);
      if (!move) return false;

      setGame(tempGame);
      setMoveHistory(prev => [...prev, move.san]);
      
      if (tempGame.in_checkmate()) { // chess.js 0.10.3 uses in_checkmate()
        const turn = tempGame.turn(); 
        const loserAddr = turn === 'w' ? gameData?.p1 : gameData?.p2;
        if (loserAddr && wallet.toLowerCase() === loserAddr.toLowerCase()) {
          updateStatus("Checkmate! You lost. Sign defeat.", "warning");
        } else {
          updateStatus("Victory! Waiting for opponent...", "success");
        }
      }
      return true;
    } catch (e) { return false; }
  }

  async function signDefeat() {
    if (!gameId || !browserProvider) return;
    try {
      updateStatus("Signing Proof of Loss...", "loading");
      const signer = await browserProvider.getSigner(); 
      const messageHash = window.ethers.solidityPackedKeccak256(["uint256", "string"], [gameId, "loss"]);
      const messageBytes = window.ethers.getBytes(messageHash);
      const signature = await signer.signMessage(messageBytes);
      
      setLoserSignature(signature);
      updateStatus("Signed! Switch to Winner to claim.", "success");
    } catch (err) { handleError(err); }
  }

  async function claimPrize() {
    if (!loserSignature || !writeContract) return updateStatus("Error", "error");
    try {
      updateStatus("Claiming Prize...", "loading");
      
      // FIX: Force Nonce and GasLimit to bypass Metamask Checks
      const overrides = await getOverrideOptions();
      const tx = await writeContract.reportWin(gameId, loserSignature, overrides);
      
      await tx.wait();
      updateStatus("Payout Confirmed!", "success");
      const bal = await browserProvider.getBalance(wallet);
      setBalance(window.ethers.formatEther(bal));
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

  // --- RENDERING HELPERS ---
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

  // If libs aren't loaded, show loading screen
  if (!libsLoaded) {
    return (
      <div className="min-h-screen bg-[#0B0E14] flex flex-col items-center justify-center text-slate-400 gap-4">
        <Loader2 className="animate-spin text-indigo-500" size={48} />
        <p>Loading Secure Libraries...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-200 font-sans selection:bg-indigo-500/30 pb-20">
      
      {/* NAVBAR */}
      <nav className="border-b border-slate-800 bg-[#0B0E14]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3 group cursor-pointer" onClick={() => resetApp(true)}>
            <div className="bg-gradient-to-br from-indigo-600 to-violet-600 p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
              <Trophy size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-none">Grandmaster<span className="text-indigo-400">Chain</span></h1>
              <span className="text-[10px] text-slate-500 font-medium tracking-widest uppercase mt-1">Trustless E-Sports</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => resetApp(true)} className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-full transition-all">
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
        
        {/* LEFT PANEL: CONTROLS */}
        <div className="w-full lg:w-1/3 flex flex-col gap-6">
          
          {/* Status Bar */}
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
                <h2 className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">System Status</h2>
                <p className="text-sm font-medium text-slate-200 leading-snug">{status}</p>
              </div>
            </div>
          </div>

          {/* Matchmaking Card */}
          <div className="bg-[#151921] border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
               <h3 className="text-sm font-bold text-white flex items-center gap-2"><Swords size={16} className="text-indigo-500"/> Lobby</h3>
               <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-1 rounded border border-indigo-500/20 font-mono">Wager: 1.0 ETH</span>
            </div>

            <button 
              onClick={createGame}
              disabled={!wallet || gameId}
              className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 disabled:grayscale py-4 rounded-xl font-bold text-white shadow-lg transition-all"
            >
              Create Game (Deposit 1 ETH)
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
                Join
              </button>
            </div>

            {gameId && (
               <div className="mt-2 bg-emerald-900/10 border border-emerald-500/20 p-3 rounded-lg flex flex-col gap-2">
                 <div className="flex justify-between items-center">
                   <span className="text-xs text-emerald-400 font-bold uppercase">Game Active</span>
                   <div className="flex items-center gap-2 text-white font-mono font-bold text-sm cursor-pointer" onClick={() => navigator.clipboard.writeText(gameId)}>
                     ID: {gameId} <Copy size={12}/>
                   </div>
                 </div>
                 {gameData && (
                   <div className="text-[10px] text-slate-400 font-mono grid grid-cols-2 gap-2 mt-1">
                      <div>P1: <span className={gameData.p1.toLowerCase() === wallet.toLowerCase() ? "text-indigo-400" : ""}>{shortAddr(gameData.p1)}</span></div>
                      <div>P2: <span className={gameData.p2 !== window.ethers.ZeroAddress ? "text-slate-200" : "text-slate-500 italic"}>
                        {gameData.p2 !== window.ethers.ZeroAddress ? shortAddr(gameData.p2) : "Waiting..."}
                      </span></div>
                   </div>
                 )}
               </div>
            )}
          </div>

          {/* Settlement Protocol (Only shows when needed) */}
          {(loserSignature || (game && game.in_checkmate())) && (
            <div className="bg-gradient-to-br from-amber-900/20 to-orange-900/20 border border-amber-500/30 rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center gap-2 mb-4 text-amber-400 font-bold text-sm uppercase tracking-wider">
                <Lock size={16}/> Settlement
              </div>
              <div className="space-y-3">
                <button 
                  onClick={signDefeat}
                  disabled={loserSignature || !isMyTurnToSign} 
                  className={`w-full py-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                    loserSignature ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : 
                    isMyTurnToSign ? "bg-amber-500/20 border-amber-500/50 text-amber-200 hover:bg-amber-500/30" : 
                    "bg-slate-800 border-slate-700 text-slate-500 opacity-50"
                  }`}
                >
                  {loserSignature ? "Defeat Signed" : "Sign Defeat (Loser)"}
                </button>

                <button 
                  onClick={claimPrize}
                  disabled={!loserSignature || !isMyTurnToClaim}
                  className={`w-full py-3 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${
                    (!loserSignature || !isMyTurnToClaim) ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  }`}
                >
                  <Trophy size={16} /> Claim Prize (Winner)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: CHESSBOARD */}
        <div className="w-full lg:w-2/3 flex flex-col items-center">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative bg-[#151921] p-4 rounded-2xl border border-slate-700 shadow-2xl">
              <div className="w-[80vw] max-w-[600px] aspect-square rounded-lg overflow-hidden border border-slate-700/50">
                {/* Use our custom board component */}
                <CustomChessboard 
                  game={game} 
                  onMove={onMove}
                  orientation={(!isPlayer1 && gameId) ? 'black' : 'white'}
                />
              </div>
            </div>
          </div>
          
          <div className="mt-8 w-full max-w-[600px] bg-[#151921] border border-slate-800 rounded-xl p-4 min-h-[100px]">
             <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2"><History size={14}/> Move History</h3>
             <div className="flex flex-wrap gap-2 text-sm font-mono text-slate-400">
               {moveHistory.length > 0 ? moveHistory.map((m, i) => (
                 <span key={i} className={i % 2 === 0 ? "text-white" : "text-slate-500"}>{Math.ceil((i+1)/2)}. {m}</span>
               )) : <span className="opacity-30 italic">Moves will appear here...</span>}
             </div>
          </div>
        </div>
      </main>
    </div>
  );
}