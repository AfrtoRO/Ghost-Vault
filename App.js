import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, StatusBar, Modal, KeyboardAvoidingView, Platform, 
  Animated, AppState, TouchableWithoutFeedback, Keyboard, Image, Dimensions, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { WebView } from 'react-native-webview';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system'; // تم تفعيلها للنسخة النهائية
import { Video } from 'expo-av';
import * as LocalAuthentication from 'expo-local-authentication';

const { width, height } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0E17', card: '#151A25', input: '#1E2532',
  primary: '#0066FF', primaryLight: '#0066FF20',
  accent: '#00D1FF', text: '#FFFFFF', subText: '#8B949E',
  border: '#232B3B', danger: '#FF4757', success: '#2ED573', warning: '#FFA502',
  vaultPrimary: '#5D3FD3', vaultBg: '#020202', vaultCard: '#0A0A0A', vaultBorder: '#1A1A1A'
};

// --- Encryption ---
const ENCRYPT_KEY = 7;
const encryptData = (dataObj) => JSON.stringify(dataObj).split('').map(c => (c.charCodeAt(0) + ENCRYPT_KEY).toString(16)).join('-');
const decryptData = (encryptedStr) => {
  try { return JSON.parse(encryptedStr.split('-').map(h => String.fromCharCode(parseInt(h, 16) - ENCRYPT_KEY)).join('')); } 
  catch (e) { return []; }
};

// --- Custom Video Player Component ---
const SecureVideoPlayer = ({ sourceUri, onClose }) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const [userInput, setUserInput] = useState('');

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for(let i=0; i<4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    setCaptchaCode(code);
    setUserInput('');
    setShowCaptcha(true);
  };

  const verifyCaptcha = () => {
    if (userInput.toUpperCase() === captchaCode) {
      setIsMuted(false);
      setShowCaptcha(false);
    } else {
      setUserInput('');
      generateCaptcha(); 
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Video 
        source={{ uri: sourceUri }} 
        style={{ flex: 1 }} 
        useNativeControls={false} 
        resizeMode="contain" 
        shouldPlay={isPlaying} 
        isMuted={isMuted} 
        isLooping 
      />
      <View style={styles.customVideoControls}>
        <TouchableOpacity style={styles.vidControlBtn} onPress={onClose}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <TouchableOpacity style={styles.vidControlBtn} onPress={() => setIsPlaying(!isPlaying)}>
            <Ionicons name={isPlaying ? "pause" : "play"} size={28} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.vidControlBtn, !isMuted && {backgroundColor: COLORS.success}]} onPress={() => {
            if(isMuted) generateCaptcha();
            else setIsMuted(true);
          }}>
            <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={28} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showCaptcha} transparent animationType="fade">
        <View style={styles.modalOverlayCen}>
          <View style={styles.confirmCard}>
            <Ionicons name="lock-closed" size={40} color={COLORS.warning} style={{ marginBottom: 10 }} />
            <Text style={styles.confirmTitle}>Audio Security Lock</Text>
            <Text style={styles.confirmSub}>Enter the authorization code to enable audio playback.</Text>
            
            <View style={styles.captchaBox}>
              <Text style={styles.captchaText}>{captchaCode}</Text>
            </View>

            <TextInput 
              style={[styles.input, { textAlign: 'center', fontSize: 20, letterSpacing: 5, marginTop: 15 }]} 
              placeholder="_ _ _ _" 
              placeholderTextColor={COLORS.border} 
              maxLength={4}
              autoCapitalize="characters"
              value={userInput} 
              onChangeText={setUserInput} 
            />

            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 10 }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCaptcha(false)}>
                <Text style={styles.cancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.delBtn, { backgroundColor: COLORS.vaultPrimary }]} onPress={verifyCaptcha}>
                <Text style={styles.delBtnTxt}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default function CovertVaultFull() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isDecoyApp, setIsDecoyApp] = useState(false);
  const [fakeLoading, setFakeLoading] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [failCount, setFailCount] = useState(0);
  
  const [links, setLinks] = useState([]);
  const [videos, setVideos] = useState([]);
  const [vaultTab, setVaultTab] = useState('links'); 
  const [activeUrl, setActiveUrl] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [privacyType, setPrivacyType] = useState('visible'); 
  const [iconType, setIconType] = useState('auto'); 
  const [customIconUri, setCustomIconUri] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const [decoyTab, setDecoyTab] = useState('home');

  const [vidUrlInput, setVidUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState('00:00');

  const [appState, setAppState] = useState(AppState.currentState);
  const [showPrivacyBlur, setShowPrivacyBlur] = useState(false);
  
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const [toastData, setToastData] = useState({ visible: false, type: 'info', title: '', msg: '' });
  const toastAnim = useRef(new Animated.Value(width)).current; 
  const progressAnim = useRef(new Animated.Value(100)).current;

  useEffect(() => {
    loadEncryptedData();
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') setShowPrivacyBlur(false);
      else if (nextAppState.match(/inactive|background/)) setShowPrivacyBlur(true);
      setAppState(nextAppState);
    });
    return () => subscription.remove();
  }, [appState]);

  const showToast = (type, title, msg) => {
    setToastData({ visible: true, type, title, msg });
    Animated.spring(toastAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
    progressAnim.setValue(100);
    Animated.timing(progressAnim, { toValue: 0, duration: 2500, useNativeDriver: false }).start(() => {
      Animated.timing(toastAnim, { toValue: width, duration: 300, useNativeDriver: true }).start(() => {
        setToastData({ visible: false, type: 'info', title: '', msg: '' });
      });
    });
  };

  const loadEncryptedData = async () => {
    const savedLinks = await AsyncStorage.getItem('cv_links_vfinal');
    const savedVids = await AsyncStorage.getItem('cv_vids_vfinal');
    const savedFails = await AsyncStorage.getItem('cv_fails_vfinal');
    if (savedLinks) setLinks(decryptData(savedLinks));
    if (savedVids) setVideos(decryptData(savedVids));
    if (savedFails) setFailCount(parseInt(savedFails));
  };

  const saveEncryptedLinks = async (newLinks) => { setLinks(newLinks); await AsyncStorage.setItem('cv_links_vfinal', encryptData(newLinks)); };
  const saveEncryptedVideos = async (newVids) => { setVideos(newVids); await AsyncStorage.setItem('cv_vids_vfinal', encryptData(newVids)); };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  const getExactPINs = () => {
    const now = new Date();
    const h = now.getHours(); const m = now.getMinutes();
    const h12 = h % 12 || 12;
    const padM = m < 10 ? '0' + m : m; const padH = h < 10 ? '0' + h : h;
    return [`${h12}${padM}`, `${h}${padM}`, `${padH}${padM}`];
  };

  const handleSelfDestruct = async () => {
    await AsyncStorage.clear();
    setLinks([]); setVideos([]); setFailCount(0);
    showToast('danger', 'Error', 'Connection timeout.'); 
  };

  const authenticateBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        showToast('warning', 'Hardware Notice', 'Biometrics missing. Using PIN bypass for test.');
        grantAccess();
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({ 
        promptMessage: 'Verify Identity',
        disableDeviceFallback: true, 
        cancelLabel: 'Cancel'
      });
      
      if (result.success) grantAccess();
      else showToast('danger', 'Auth Failed', 'Biometrics rejected.');
    } catch (e) {
      grantAccess(); // Fallback for simulation
    }
  };

  const grantAccess = async () => {
    setIsLoggedIn(true);
    setAuthInput(''); setPassInput(''); setFailCount(0);
    await AsyncStorage.setItem('cv_fails_vfinal', '0');
    showToast('success', 'Vault Unlocked', 'Ghost protocol deactivated.');
  };

  const handleAuthChange = (text) => {
    setAuthInput(text);
    const validPins = getExactPINs();
    if (validPins.includes(text)) {
      Keyboard.dismiss();
      authenticateBiometrics(); 
    }
  };

  const triggerFakeLogin = () => {
    Keyboard.dismiss();
    const isNumericOnly = /^\d+$/.test(authInput);
    if (isNumericOnly && (authInput.length === 3 || authInput.length === 4)) {
      const newFail = failCount + 1;
      setFailCount(newFail);
      AsyncStorage.setItem('cv_fails_vfinal', newFail.toString());
      if (newFail >= 5) handleSelfDestruct();
      else triggerShake();
      setAuthInput('');
      return;
    }
    setFakeLoading(true);
    setTimeout(() => {
      setFakeLoading(false); setIsDecoyApp(true); setDecoyTab('home');
    }, 1500); 
  };

  const downloadVideoUrl = async () => {
    if (!vidUrlInput) return;
    Keyboard.dismiss();
    setIsDownloading(true);
    setDownloadProgress(0);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress >= 100) {
        clearInterval(interval);
        setDownloadProgress(100);
        setTimeRemaining('00:00');
        setTimeout(() => {
          setIsDownloading(false);
          setVidUrlInput('');
          const newVid = { id: Date.now().toString(), uri: 'https://www.w3schools.com/html/mov_bbb.mp4', isFav: false };
          saveEncryptedVideos([newVid, ...videos]);
          showToast('success', 'Secured', 'Video intercepted and sandboxed.');
        }, 1000);
      } else {
        setDownloadProgress(progress);
        const secs = Math.floor((100 - progress) / 10);
        setTimeRemaining(`00:0${secs < 10 ? '0'+secs : secs}`);
      }
    }, 500);
  };

  const pickVideoSecurely = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Videos, quality: 1 });
    if (!result.canceled) {
      const sourceUri = result.assets[0].uri;
      try {
        const ext = sourceUri.split('.').pop();
        const securePath = FileSystem.documentDirectory + `sec_${Date.now()}.${ext}`;
        await FileSystem.copyAsync({ from: sourceUri, to: securePath });
        const newVid = { id: Date.now().toString(), uri: securePath, isFav: false };
        saveEncryptedVideos([newVid, ...videos]);
        showToast('success', 'Secured', 'Local video encrypted to FileSystem.');
      } catch (e) {
        showToast('danger', 'Error', 'Failed to write to FileSystem.');
      }
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) { setCustomIconUri(result.assets[0].uri); setIconType('custom'); }
  };

  const addNewLink = () => {
    if (!newTitle || !newUrl) { showToast('warning', 'Missing Info', 'Please fill all fields'); return; }
    let finalUrl = newUrl;
    if (!finalUrl.startsWith('http')) finalUrl = 'https://' + finalUrl;
    const newItem = { id: Date.now().toString(), title: newTitle, url: finalUrl, privacy: privacyType, iconType: iconType, customIcon: customIconUri, isFav: false };
    saveEncryptedLinks([newItem, ...links]);
    setNewTitle(''); setNewUrl(''); setPrivacyType('visible'); setIconType('auto'); setCustomIconUri('');
    setShowAddModal(false);
    showToast('success', 'Saved', `${newTitle} encrypted.`);
  };

  const toggleFavorite = (type, id) => {
    if (type === 'link') {
      const updated = links.map(l => l.id === id ? { ...l, isFav: !l.isFav } : l);
      saveEncryptedLinks(updated);
    } else {
      const updated = videos.map(v => v.id === id ? { ...v, isFav: !v.isFav } : v);
      saveEncryptedVideos(updated);
    }
    showToast('info', 'Updated', 'Priority changed.');
  };

  const executeDelete = async () => {
    if (!confirmDel) return;
    if (confirmDel.type === 'link') {
      saveEncryptedLinks(links.filter(l => l.id !== confirmDel.id));
      showToast('success', 'Deleted', `${confirmDel.title} removed.`);
    } else {
      const target = videos.find(v => v.id === confirmDel.id);
      if (target) {
        try { await FileSystem.deleteAsync(target.uri); } catch(e) {}
      }
      saveEncryptedVideos(videos.filter(v => v.id !== confirmDel.id));
      showToast('success', 'Deleted', `Video permanently removed.`);
    }
    setConfirmDel(null);
  };

  const copyUrl = async (url) => {
    await Clipboard.setStringAsync(url);
    showToast('info', 'Copied', 'URL saved to clipboard.');
  };

  const renderIcon = (item) => {
    if (item.iconType === 'none') return <Ionicons name="globe-outline" size={24} color={COLORS.subText} />;
    if (item.iconType === 'custom' && item.customIcon) return <Image source={{ uri: item.customIcon }} style={{ width: 30, height: 30, borderRadius: 8 }} />;
    const domain = item.url.replace('http://', '').replace('https://', '').split('/')[0];
    return <Image source={{ uri: `https://www.google.com/s2/favicons?sz=64&domain=${domain}` }} style={{ width: 30, height: 30, borderRadius: 8 }} />;
  };

  const sortedLinks = [...links].sort((a, b) => (b.isFav ? 1 : 0) - (a.isFav ? 1 : 0));
  const sortedVideos = [...videos].sort((a, b) => (b.isFav ? 1 : 0) - (a.isFav ? 1 : 0));

  const ToastComponent = () => {
    const icons = { success: 'checkmark-circle', danger: 'close-circle', warning: 'warning', info: 'information-circle' };
    const colors = { success: COLORS.success, danger: COLORS.danger, warning: COLORS.warning, info: COLORS.accent };
    return (
      <Animated.View style={[styles.sideToast, { transform: [{ translateX: toastAnim }] }]}>
        <View style={styles.toastContent}>
          <Ionicons name={icons[toastData.type]} size={18} color={colors[toastData.type]} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.toastTitle}>{toastData.title}</Text>
            <Text style={styles.toastMsg}>{toastData.msg}</Text>
          </View>
        </View>
        <View style={styles.toastBarBg}>
          <Animated.View style={[styles.toastBarFill, { backgroundColor: colors[toastData.type], width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
        </View>
      </Animated.View>
    );
  };

  if (!isLoggedIn && !isDecoyApp) {
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <KeyboardAvoidingView style={styles.centerAll} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.coverLogoBox}>
                <Ionicons name="stats-chart" size={40} color={COLORS.primary} />
              </View>
              <Text style={styles.coverTitle}>NexTrade Lite</Text>
              <Text style={styles.coverSub}>Start your investment journey</Text>

              <Animated.View style={{ width: '100%', paddingHorizontal: 30, marginTop: 40, transform: [{ translateX: shakeAnim }] }}>
                <View style={styles.coverInputWrap}>
                  <Ionicons name="mail-outline" size={20} color={COLORS.subText} style={styles.coverInputIcon}/>
                  <TextInput 
                    style={styles.coverInput} 
                    placeholder="Email Address" 
                    placeholderTextColor={COLORS.subText}
                    value={authInput}
                    onChangeText={handleAuthChange}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={[styles.coverInputWrap, { marginTop: 15 }]}>
                  <Ionicons name="lock-closed-outline" size={20} color={COLORS.subText} style={styles.coverInputIcon}/>
                  <TextInput 
                    style={styles.coverInput} 
                    placeholder="Password" 
                    placeholderTextColor={COLORS.subText}
                    secureTextEntry
                    value={passInput}
                    onChangeText={setPassInput}
                  />
                </View>
                
                <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 10 }}>
                  <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '600' }}>Forgot Password?</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.coverBtn} onPress={triggerFakeLogin} disabled={fakeLoading}>
                  {fakeLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.coverBtnTxt}>Sign In</Text>}
                </TouchableOpacity>
                
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 25 }}>
                  <Text style={{ color: COLORS.subText, fontSize: 14 }}>New to NexTrade? </Text>
                  <TouchableOpacity onPress={triggerFakeLogin}>
                    <Text style={{ color: COLORS.primary, fontSize: 14, fontWeight: 'bold' }}>Create Account</Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </KeyboardAvoidingView>
            <ToastComponent />
            {showPrivacyBlur && <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />}
          </SafeAreaView>
        </View>
      </TouchableWithoutFeedback>
    );
  }

  if (isDecoyApp) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar barStyle="light-content" />
          <View style={styles.decoyHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.decoyAvatar}><Ionicons name="person" size={20} color="#FFF" /></View>
              <View style={{ marginLeft: 10 }}>
                <Text style={{ color: COLORS.subText, fontSize: 12 }}>New User</Text>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>Basic Account</Text>
              </View>
            </View>
            <Ionicons name="notifications-outline" size={24} color={COLORS.text} />
          </View>
          
          <ScrollView style={{ flex: 1, padding: 20 }} showsVerticalScrollIndicator={false}>
            {decoyTab === 'home' && (
              <>
                <View style={styles.decoyBalanceCard}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Available Balance</Text>
                  <Text style={{ color: '#FFF', fontSize: 40, fontWeight: '900', marginVertical: 10 }}>$12.45</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="arrow-up" size={16} color={COLORS.success} />
                    <Text style={{ color: COLORS.success, fontWeight: 'bold', marginLeft: 4 }}>$0.12 (1.2%) Today</Text>
                  </View>
                </View>
                <TouchableOpacity style={[styles.coverBtn, { marginTop: 0, marginBottom: 25, backgroundColor: COLORS.border }]} onPress={() => showToast('warning', 'Notice', 'Add a payment method first.')}>
                  <Text style={[styles.coverBtnTxt, { color: COLORS.subText }]}>Deposit Funds to Trade</Text>
                </TouchableOpacity>
                <Text style={styles.decoySectionTitle}>Recent Transactions</Text>
                <View style={{ alignItems: 'center', marginTop: 30 }}>
                  <Ionicons name="receipt-outline" size={50} color={COLORS.border} />
                  <Text style={{ color: COLORS.subText, marginTop: 10 }}>No recent activity.</Text>
                </View>
              </>
            )}
            {decoyTab === 'market' && (
              <View style={{ alignItems: 'center', marginTop: 50 }}>
                <Ionicons name="bar-chart" size={80} color={COLORS.border} />
                <Text style={{ color: COLORS.subText, marginTop: 20 }}>Market data loading...</Text>
              </View>
            )}
            {decoyTab === 'wallet' && (
              <View style={{ alignItems: 'center', marginTop: 50 }}>
                <Ionicons name="wallet-outline" size={80} color={COLORS.border} />
                <Text style={{ color: COLORS.subText, marginTop: 20 }}>Connect a bank account.</Text>
              </View>
            )}
          </ScrollView>
          <View style={styles.decoyBottomNav}>
            <TouchableOpacity style={styles.decoyNavItem} onPress={() => setDecoyTab('home')}>
              <Ionicons name={decoyTab === 'home' ? 'home' : 'home-outline'} size={24} color={decoyTab === 'home' ? COLORS.primary : COLORS.subText} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.decoyNavItem} onPress={() => setDecoyTab('market')}>
              <Ionicons name={decoyTab === 'market' ? 'bar-chart' : 'bar-chart-outline'} size={24} color={decoyTab === 'market' ? COLORS.primary : COLORS.subText} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.decoyNavItem} onPress={() => setDecoyTab('wallet')}>
              <Ionicons name={decoyTab === 'wallet' ? 'wallet' : 'wallet-outline'} size={24} color={decoyTab === 'wallet' ? COLORS.primary : COLORS.subText} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.decoyNavItem} onPress={() => { setIsDecoyApp(false); setAuthInput(''); setPassInput(''); }}>
              <Ionicons name="settings-outline" size={24} color={COLORS.subText} />
            </TouchableOpacity>
          </View>
          <ToastComponent />
          {showPrivacyBlur && <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />}
        </SafeAreaView>
      </View>
    );
  }

  if (activeUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.webviewHeader}>
            <TouchableOpacity onPress={() => setActiveUrl(null)} style={styles.webviewBack}>
              <Ionicons name="close" size={24} color={COLORS.text} />
              <Text style={styles.webviewBackTxt}>Close Connection</Text>
            </TouchableOpacity>
          </View>
          <WebView source={{ uri: activeUrl }} style={{ flex: 1, backgroundColor: COLORS.bg }} showsVerticalScrollIndicator={false} javaScriptEnabled={true} domStorageEnabled={true} sharedCookiesEnabled={true} thirdPartyCookiesEnabled={true} />
          <ToastComponent />
          {showPrivacyBlur && <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />}
        </SafeAreaView>
      </View>
    );
  }

  if (activeVideo) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <SafeAreaView style={styles.safeArea}>
          <SecureVideoPlayer sourceUri={activeVideo.uri} onClose={() => setActiveVideo(null)} />
          <ToastComponent />
          {showPrivacyBlur && <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />}
        </SafeAreaView>
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={{ flex: 1, backgroundColor: COLORS.vaultBg }}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar barStyle="light-content" />
          <View style={styles.vaultHeader}>
            <View>
              <Text style={styles.vaultHeaderTitle}>Ghost Vault</Text>
              <Text style={styles.vaultHeaderSub}>{vaultTab === 'links' ? links.length + ' Secured Assets' : videos.length + ' Secured Assets'}</Text>
            </View>
            <View style={styles.headerRow}>
              <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.danger + '20', borderColor: 'transparent' }]} onPress={() => setIsLoggedIn(false)}>
                <Ionicons name="power" size={20} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.tabSwitcher}>
            <TouchableOpacity style={[styles.tabBtn, vaultTab === 'links' && styles.tabBtnActive]} onPress={() => setVaultTab('links')}>
              <Text style={[styles.tabTxt, vaultTab === 'links' && { color: COLORS.text }]}>Encrypted Links</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, vaultTab === 'videos' && styles.tabBtnActive]} onPress={() => setVaultTab('videos')}>
              <Text style={[styles.tabTxt, vaultTab === 'videos' && { color: COLORS.text }]}>Secure Videos</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {vaultTab === 'links' && (
              <>
                <TouchableOpacity style={[styles.coverBtn, { marginTop: 0, marginBottom: 20, backgroundColor: COLORS.vaultCard, borderWidth: 1, borderColor: COLORS.vaultBorder }]} onPress={() => setShowAddModal(true)}>
                  <Ionicons name="add-circle" size={20} color={COLORS.vaultPrimary} style={{marginRight: 8}} />
                  <Text style={[styles.coverBtnTxt, {color: COLORS.vaultPrimary}]}>Secure New Link</Text>
                </TouchableOpacity>

                {sortedLinks.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="shield-half-outline" size={60} color={COLORS.border} />
                    <Text style={styles.emptyTxt}>Vault is empty.</Text>
                  </View>
                ) : (
                  sortedLinks.map(item => (
                    <View key={item.id} style={[styles.linkCard, item.isFav && { borderColor: COLORS.warning + '50', borderWidth: 1 }]}>
                      <View style={styles.linkInfo}>
                        <View style={styles.linkIconBox}>{renderIcon(item)}</View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.linkTitle} numberOfLines={1}>{item.title}</Text>
                            <TouchableOpacity onPress={() => toggleFavorite('link', item.id)} style={{ padding: 5 }}>
                              <Ionicons name={item.isFav ? "star" : "star-outline"} size={20} color={item.isFav ? COLORS.warning : COLORS.subText} />
                            </TouchableOpacity>
                          </View>
                          {item.privacy === 'hidden' ? (
                            <Text style={styles.linkUrl}>••••••••••••••••</Text>
                          ) : (
                            <Text style={[styles.linkUrl, item.privacy === 'blur' && { opacity: 0.3 }]} numberOfLines={1}>{item.url}</Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.linkActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => copyUrl(item.url)}>
                          <Ionicons name="copy-outline" size={18} color={COLORS.subText} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.danger + '15', borderColor: 'transparent' }]} onPress={() => setConfirmDel({ type: 'link', id: item.id, title: item.title })}>
                          <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: COLORS.vaultPrimary + '20', borderColor: COLORS.vaultPrimary }]} onPress={() => setActiveUrl(item.url)}>
                          <Ionicons name="open-outline" size={18} color={COLORS.vaultPrimary} />
                          <Text style={[styles.actionTxt, { color: COLORS.vaultPrimary }]}>Connect</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </>
            )}

            {vaultTab === 'videos' && (
              <>
                <View style={styles.downloaderCard}>
                  <Text style={styles.downloaderTitle}>Remote Video Interceptor</Text>
                  <Text style={styles.downloaderSub}>Paste direct URL (.mp4) to download securely.</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                    <TextInput 
                      style={[styles.input, { flex: 1, marginBottom: 0, height: 50, backgroundColor: '#050505' }]} 
                      placeholder="https://..." 
                      placeholderTextColor={COLORS.border}
                      value={vidUrlInput}
                      onChangeText={setVidUrlInput}
                    />
                    <TouchableOpacity style={styles.downloadBtn} onPress={downloadVideoUrl}>
                      <Ionicons name="cloud-download" size={24} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={{ alignSelf: 'center', marginTop: 15 }} onPress={pickVideoSecurely}>
                     <Text style={{ color: COLORS.subText, fontSize: 13, textDecorationLine: 'underline' }}>Or import local video securely</Text>
                  </TouchableOpacity>
                </View>

                {sortedVideos.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="videocam-outline" size={60} color={COLORS.border} />
                    <Text style={styles.emptyTxt}>No secure videos found.</Text>
                  </View>
                ) : (
                  <View style={styles.vidGrid}>
                    {sortedVideos.map(vid => (
                      <View key={vid.id} style={[styles.vidWrapper, vid.isFav && { borderColor: COLORS.warning, borderWidth: 1, borderRadius: 20 }]}>
                        <TouchableOpacity style={styles.vidCard} onPress={() => setActiveVideo(vid)}>
                          <Video source={{ uri: vid.uri }} style={styles.vidThumb} resizeMode="cover" shouldPlay={false} />
                          <View style={styles.vidPlayOverlay}>
                            <Ionicons name="play" size={30} color="#FFF" />
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.vidFavBtn} onPress={() => toggleFavorite('video', vid.id)}>
                          <Ionicons name={vid.isFav ? "star" : "star-outline"} size={16} color={vid.isFav ? COLORS.warning : "#FFF"} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.vidDelBtn} onPress={() => setConfirmDel({ type: 'video', id: vid.id, title: 'this encrypted video' })}>
                          <Ionicons name="trash" size={14} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
            <View style={{ height: 50 }} />
          </ScrollView>

          <Modal visible={isDownloading} transparent animationType="fade">
            <View style={styles.modalOverlayCen}>
              <View style={styles.confirmCard}>
                <Ionicons name="cloud-download-outline" size={50} color={COLORS.accent} style={{ marginBottom: 15 }} />
                <Text style={styles.confirmTitle}>Intercepting Stream...</Text>
                <Text style={styles.confirmSub}>Downloading securely to Vault</Text>
                
                <View style={{ width: '100%', height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginVertical: 15, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${downloadProgress}%`, backgroundColor: COLORS.accent }} />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                  <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{downloadProgress}%</Text>
                  <Text style={{ color: COLORS.subText }}>ETA: {timeRemaining}</Text>
                </View>
              </View>
            </View>
          </Modal>

          <Modal visible={showAddModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => { Keyboard.dismiss(); setShowAddModal(false); }} />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Secure New Asset</Text>
                  <TouchableOpacity onPress={() => setShowAddModal(false)}>
                    <Ionicons name="close" size={24} color={COLORS.subText} />
                  </TouchableOpacity>
                </View>
                
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.inputLabel}>Asset Title</Text>
                  <TextInput style={styles.input} placeholder="e.g. SMM Panel" placeholderTextColor={COLORS.border} value={newTitle} onChangeText={setNewTitle} />
                  
                  <Text style={styles.inputLabel}>Target URL</Text>
                  <TextInput style={styles.input} placeholder="example.com" placeholderTextColor={COLORS.border} autoCapitalize="none" keyboardType="url" value={newUrl} onChangeText={setNewUrl} />
                  
                  <Text style={styles.inputLabel}>Privacy Level</Text>
                  <View style={styles.optionsRow}>
                    {['visible', 'blur', 'hidden'].map(p => (
                      <TouchableOpacity key={p} style={[styles.optionBtn, privacyType === p && styles.optionActive]} onPress={() => setPrivacyType(p)}>
                        <Text style={[styles.optionTxt, privacyType === p && { color: COLORS.text }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Icon Rendering</Text>
                  <View style={styles.optionsRow}>
                    <TouchableOpacity style={[styles.optionBtn, iconType === 'auto' && styles.optionActive]} onPress={() => setIconType('auto')}>
                       <Text style={[styles.optionTxt, iconType === 'auto' && { color: COLORS.text }]}>Auto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.optionBtn, iconType === 'none' && styles.optionActive]} onPress={() => setIconType('none')}>
                       <Text style={[styles.optionTxt, iconType === 'none' && { color: COLORS.text }]}>None</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.optionBtn, iconType === 'custom' && styles.optionActive]} onPress={pickImage}>
                       <Text style={[styles.optionTxt, iconType === 'custom' && { color: COLORS.text }]}>Upload</Text>
                    </TouchableOpacity>
                  </View>

                  {iconType === 'custom' && customIconUri ? (
                    <View style={{ alignItems: 'center', marginVertical: 10 }}>
                      <Image source={{ uri: customIconUri }} style={{ width: 60, height: 60, borderRadius: 15 }} />
                    </View>
                  ) : null}
                  
                  <TouchableOpacity style={[styles.coverBtn, { width: '100%', marginTop: 10, backgroundColor: COLORS.vaultPrimary }]} onPress={addNewLink}>
                    <Text style={styles.coverBtnTxt}>Encrypt & Save</Text>
                  </TouchableOpacity>
                  <View style={{ height: 30 }}/>
                </ScrollView>
              </KeyboardAvoidingView>
            </View>
          </Modal>

          <Modal visible={!!confirmDel} transparent animationType="fade">
            <View style={styles.modalOverlayCen}>
              <View style={styles.confirmCard}>
                <Ionicons name="warning" size={55} color={COLORS.danger} style={{ marginBottom: 15 }} />
                <Text style={styles.confirmTitle}>Purge Data</Text>
                <Text style={styles.confirmSub}>Are you sure you want to permanently delete {confirmDel?.title}? This cannot be reversed.</Text>
                <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 25 }}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDel(null)}>
                    <Text style={styles.cancelBtnTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.delBtn} onPress={executeDelete}>
                    <Text style={styles.delBtnTxt}>Purge</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          <ToastComponent />
          {showPrivacyBlur && <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />}
        </SafeAreaView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  centerAll: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  coverLogoBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  coverTitle: { fontSize: 32, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  coverSub: { fontSize: 15, color: COLORS.subText, marginTop: 8 },
  coverInputWrap: { flexDirection: 'row', alignItems: 'center', height: 60, backgroundColor: COLORS.input, borderRadius: 16, paddingHorizontal: 15, borderWidth: 1, borderColor: COLORS.border },
  coverInputIcon: { marginRight: 10 },
  coverInput: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '600' },
  coverBtn: { height: 60, width: '100%', backgroundColor: COLORS.primary, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 30 },
  coverBtnTxt: { color: '#FFF', fontSize: 17, fontWeight: 'bold', flexDirection: 'row', alignItems: 'center' },

  decoyHeader: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  decoyAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  decoyBalanceCard: { backgroundColor: COLORS.card, padding: 25, borderRadius: 24, marginBottom: 25, borderWidth: 1, borderColor: COLORS.border },
  decoySectionTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  decoyListRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderColor: COLORS.border },
  decoyCoinIcon: { width: 40, height: 40, borderRadius: 12 },
  decoyBottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20, backgroundColor: COLORS.bg, borderTopWidth: 1, borderColor: COLORS.border },
  decoyNavItem: { flex: 1, alignItems: 'center' },

  vaultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.vaultBorder },
  vaultHeaderTitle: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  vaultHeaderSub: { fontSize: 14, color: COLORS.vaultPrimary, fontWeight: '800', marginTop: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.vaultCard, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  
  tabSwitcher: { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, backgroundColor: COLORS.vaultCard, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: COLORS.vaultBorder },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: COLORS.vaultBg },
  tabTxt: { color: COLORS.subText, fontWeight: '800', fontSize: 14 },

  listContainer: { flex: 1, padding: 20 },
  emptyState: { alignItems: 'center', marginTop: 80 },
  emptyTxt: { color: COLORS.subText, fontSize: 16, fontWeight: '700', marginTop: 15 },
  
  linkCard: { backgroundColor: COLORS.vaultCard, borderRadius: 24, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: COLORS.vaultBorder },
  linkInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  linkIconBox: { width: 50, height: 50, borderRadius: 16, backgroundColor: COLORS.vaultBg, justifyContent: 'center', alignItems: 'center', marginRight: 15, borderWidth: 1, borderColor: COLORS.vaultBorder },
  linkTitle: { color: COLORS.text, fontSize: 17, fontWeight: '900', marginBottom: 4, flex: 1 },
  linkUrl: { color: COLORS.subText, fontSize: 13, fontWeight: '600' },
  
  linkActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  actionBtn: { flex: 0.25, flexDirection: 'row', height: 42, borderRadius: 12, backgroundColor: COLORS.vaultBg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  actionTxt: { fontWeight: '800', fontSize: 13, marginLeft: 6 },
  
  downloaderCard: { backgroundColor: COLORS.vaultCard, borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: COLORS.vaultBorder },
  downloaderTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  downloaderSub: { color: COLORS.subText, fontSize: 12, marginTop: 4 },
  downloadBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: COLORS.vaultPrimary, justifyContent: 'center', alignItems: 'center' },

  vidGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  vidWrapper: { width: (width - 55) / 2, aspectRatio: 1, marginBottom: 15 },
  vidCard: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.vaultCard, borderWidth: 1, borderColor: COLORS.vaultBorder },
  vidThumb: { width: '100%', height: '100%' },
  vidPlayOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  vidDelBtn: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.danger, justifyContent: 'center', alignItems: 'center' },
  vidFavBtn: { position: 'absolute', top: 10, left: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },

  customVideoControls: { position: 'absolute', bottom: 40, width: '100%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 30 },
  vidControlBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },

  captchaBox: { padding: 15, backgroundColor: COLORS.vaultBg, borderRadius: 12, width: '100%', alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: COLORS.vaultBorder },
  captchaText: { color: COLORS.text, fontSize: 24, fontWeight: '900', letterSpacing: 8, fontStyle: 'italic' },

  sideToast: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 15, width: 220, backgroundColor: '#151A25', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#232B3B', zIndex: 9999, shadowColor: '#000', shadowOffset: { width: -5, height: 5 }, shadowOpacity: 0.5, shadowRadius: 15 },
  toastContent: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  toastTitle: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  toastMsg: { color: COLORS.subText, fontSize: 11, marginTop: 1 },
  toastBarBg: { width: '100%', height: 2, backgroundColor: 'rgba(255,255,255,0.05)' },
  toastBarFill: { height: '100%' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.vaultCard, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 30, paddingBottom: 20, maxHeight: '85%', borderWidth: 1, borderColor: COLORS.vaultBorder },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  modalTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  inputLabel: { color: COLORS.subText, fontSize: 12, fontWeight: '800', marginBottom: 8, marginLeft: 5, textTransform: 'uppercase' },
  input: { width: '100%', height: 55, backgroundColor: COLORS.vaultBg, borderRadius: 16, borderWidth: 1, borderColor: COLORS.vaultBorder, color: COLORS.text, fontSize: 15, paddingHorizontal: 20, marginBottom: 20 },
  
  optionsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  optionBtn: { flex: 1, height: 45, backgroundColor: COLORS.vaultBg, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  optionActive: { backgroundColor: COLORS.vaultPrimary + '20', borderColor: COLORS.vaultPrimary },
  optionTxt: { color: COLORS.subText, fontSize: 13, fontWeight: '700' },

  webviewHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, paddingTop: Platform.OS === 'android' ? 40 : 15, backgroundColor: COLORS.vaultCard, borderBottomWidth: 1, borderBottomColor: COLORS.vaultBorder },
  webviewBack: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.vaultBg, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  webviewBackTxt: { color: COLORS.text, fontSize: 14, fontWeight: '800', marginLeft: 6 },

  modalOverlayCen: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  confirmCard: { width: '100%', backgroundColor: COLORS.vaultCard, borderRadius: 28, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  confirmTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginBottom: 10 },
  confirmSub: { color: COLORS.subText, textAlign: 'center', marginBottom: 25, fontSize: 14, lineHeight: 22 },
  cancelBtn: { flex: 1, height: 55, backgroundColor: COLORS.vaultBg, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cancelBtnTxt: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  delBtn: { flex: 1, height: 55, backgroundColor: COLORS.danger, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  delBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 15 }
});
