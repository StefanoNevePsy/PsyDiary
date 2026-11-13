// La libreria di Firebase, ridotta a quello che la corsia veloce usa davvero (veloce.js la carica con un
// import() pigro: finisce in un pezzo a parte del sito, mai scaricato senza configurazione né prima dell'accesso).
// Importare per nome (e non con «import * as») permette al compilatore di lasciar fuori il resto della libreria
// (accesso con popup, telefono, storage, analytics…).
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, inMemoryPersistence, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, signOut } from 'firebase/auth';
import {
  initializeFirestore, connectFirestoreEmulator, doc, setDoc, deleteDoc, getDoc, collection, query, where, onSnapshot,
  writeBatch, serverTimestamp, Timestamp,
} from 'firebase/firestore';

export const sdk = {
  app: { initializeApp },
  auth: { initializeAuth, indexedDBLocalPersistence, inMemoryPersistence, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, signOut },
  firestore: { initializeFirestore, connectFirestoreEmulator, doc, setDoc, deleteDoc, getDoc, collection, query, where, onSnapshot, writeBatch, serverTimestamp, Timestamp },
};
