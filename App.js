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
import * as FileSystem from 'expo-file-system';
import { Video } from 'expo-av';
import * as LocalAuthentication from 'expo-local-authentication';
import * as MediaLibrary from 'expo-media-library';

const { width } = Dimensions.get('window');

const COLORS = {
  bg: '#0A0E17', card: '#151A25', input: '#1E2532',
  primary: '#0066FF', primaryLight: '#0066FF20',
  accent: '#00D1FF', text: '#FFFFFF', subText: '#8B949E',
  border: '#232B3B', danger: '#FF4757', success: '#2ED573', warning: '#FFA502',
  vaultPrimary: '#5D3FD3', vaultBg: '#020202', vaultCard: '#0A0A0A', vaultBorder: '#1A1A1A'
};

const ENCRYPT_KEY = 11;
const encryptData = (dataObj) => JSON.stringify(dataObj).split('').map(c => (c.charCodeAt(0) + ENCRYPT_KEY).toString(16)).join('-');
const decryptData = (encryptedStr) => {
  try { return JSON.parse(encryptedStr.split('-').map(h => String.fromCharCode(parseInt(h, 16) - ENCRYPT_KEY)).join('')); }
  catch (e) { return []; }
};

const generateSecureName = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({length: 32}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const formatTime = (millis) => {
  if (!millis) return '00:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const SecureMediaViewer = ({ media, onClose }) => {
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [status, setStatus] = useState({});
  const videoRef = useRef(null);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const [userInput, setUserInput] = useState('');
  const [barWidth, setBarWidth] = useState(0);

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
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

  const handleSkip = (direction) => {
    if (videoRef.current && status.positionMillis !== undefined) {
      const newPos = direction === 'forward' 
        ? Math.min(status.positionMillis + 10000, status.durationMillis || 0)
        : Math.max(status.positionMillis - 10000, 0);
      videoRef.current.setPositionAsync(newPos);
    }
  };

  const handleProgressBarPress = (e) => {
    if (barWidth > 0 && status.durationMillis) {
      const percentage = e.nativeEvent.locationX / barWidth;
      const seekTo = percentage * status.durationMillis;
      videoRef.current.setPositionAsync(seekTo);
    }
  };

  if (media.type === 'image') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <Image source={{ uri: media.uri }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
        <TouchableOpacity style={[styles.vidControlBtn, { position: 'absolute', top: 50, right: 20 }]} onPress={onClose}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>
      </View>
    );
  }

  const progressPercent = status.durationMillis ? (status.positionMillis / status.durationMillis) * 100 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Video 
        ref={videoRef}
        source={{ uri: media.uri }} 
        style={{ flex: 1 }} 
        useNativeControls={false} 
        resizeMode="contain" 
        shouldPlay={isPlaying} 
        isMuted={isMuted} 
        isLooping
        onPlaybackStatusUpdate={setStatus}
      />

      <View style={styles.customVideoControls}>
        <View style={styles.progressContainer}>
          <Text style={styles.timeText}>{formatTime(status.positionMillis)}</Text>
          <TouchableOpacity 
            activeOpacity={0.9} 
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)} 
            onPress={handleProgressBarPress} 
            style={styles.progressBarBg}
          >
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </TouchableOpacity>
          <Text style={styles.timeText}>{formatTime(status.durationMillis)}</Text>
        </View>

        <View style={styles.controlsRow}>
          <TouchableOpacity style={styles.vidControlBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 15, alignItems: 'center' }}>
            <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip('backward')}>
              <Ionicons name="play-back" size={20} color="#FFF" />
              <Text style={styles.skipTxt}>10s</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.vidControlBtn, { width: 60, height: 60, borderRadius: 30 }]} onPress={() => setIsPlaying(!isPlaying)}>
              <Ionicons name={isPlaying ? "pause" : "play"} size={32} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip('forward')}>
              <Ionicons name="play-forward" size={20} color="#FFF" />
              <Text style={styles.skipTxt}>10s</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={[styles.vidControlBtn, !isMuted && { backgroundColor: COLORS.success }]} onPress={() => {
            if (isMuted) generateCaptcha(); else setIsMuted(true);
          }}>
            <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={showCaptcha} transparent animationType="fade">
        <View style={styles.modalOverlayCen}>
          <View style={styles.confirmCard}>
            <Ionicons name="lock-closed" size={40} color={COLORS.warning} style={{ marginBottom: 10 }} />
            <Text style={styles.confirmTitle}>Audio Security Lock</Text>
            <Text style={styles.confirmSub}>Enter authorization code to enable audio.</Text>
            <View style={styles.captchaBox}>
              <Text style={styles.captchaText}>{captchaCode}</Text>
            </View>
            <TextInput style={[styles.input, { textAlign: 'center', fontSize: 20, letterSpacing: 5, marginTop: 15 }]} placeholder="_ _ _ _" placeholderTextColor={COLORS.border} maxLength={4} autoCapitalize="characters" keyboardAppearance="default" value={userInput} onChangeText={setUserInput} />
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
  
  const [links, setLinks] = useState([]);
  const [media, setMedia] = useState([]);
  const [vaultTab, setVaultTab] = useState('links');
  const [activeUrl, setActiveUrl] = useState(null);
  const [activeMedia, setActiveMedia] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [privacyType, setPrivacyType] = useState('visible');
  const [iconType, setIconType] = useState('auto');
  const [customIconUri, setCustomIconUri] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  const [decoyTab, setDecoyTab] = useState('home');
  const [decoyUser, setDecoyUser] = useState(null);
  
  const [showSignUp, setShowSignUp] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [signUpData, setSignUpData] = useState({ name: '', email: '', password: '', confirm: '' });

  const [vidUrlInput, setVidUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [appState, setAppState] = useState(AppState.currentState);
  const [showPrivacyBlur, setShowPrivacyBlur] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const tabAnim = useRef(new Animated.Value(0)).current;
  
  const [toastData, setToastData] = useState({ visible: false, type: 'info', title: '', msg: '' });
  const toastAnim = useRef(new Animated.Value(width)).current;
  const progressAnim = useRef(new Animated.Value(100)).current;

  // حقن جافا سكريبت لكتم أي فيديو/صوت في المتصفح تلقائياً
  const webViewMuteJS = `
    setInterval(function() {
      var mediaElements = document.querySelectorAll('video, audio');
      mediaElements.forEach(function(el) { el.muted = true; });
    }, 500);
    true;
  `;

  useEffect(() => {
    loadEncryptedData();
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') setShowPrivacyBlur(false);
      else if (nextAppState.match(/inactive|background/)) setShowPrivacyBlur(true);
      setAppState(nextAppState);
    });
    return () => subscription.remove();
  }, [appState]);

  useEffect(() => {
    if (isDecoyApp) {
      Animated.spring(tabAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }).start();
    }
  }, [decoyTab, isDecoyApp]);

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
    const savedLinks = await AsyncStorage.getItem('cv_links_master');
    const savedMedia = await AsyncStorage.getItem('cv_media_master');
    if (savedLinks) setLinks(decryptData(savedLinks));
    if (savedMedia) setMedia(decryptData(savedMedia));
  };

  const saveEncryptedLinks = async (data) => { setLinks(data); await AsyncStorage.setItem('cv_links_master', encryptData(data)); };
  const saveEncryptedMedia = async (data) => { setMedia(data); await AsyncStorage.setItem('cv_media_master', encryptData(data)); };

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

  const authenticateBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        grantAccess();
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Verify Identity', disableDeviceFallback: true, cancelLabel: 'Cancel' });
      if (result.success) grantAccess();
    } catch (e) {
      grantAccess();
    }
  };

  const grantAccess = async () => {
    setIsLoggedIn(true);
    setAuthInput(''); setPassInput('');
  };

  const handleAuthChange = (text) => {
    setAuthInput(text);
    const validPins = getExactPINs();
    if (validPins.includes(text)) {
      Keyboard.dismiss();
      authenticateBiometrics();
    }
  };
  const handleDecoyLogin = () => {
    Keyboard.dismiss();
    if (!authInput.trim() || !passInput.trim()) { triggerShake(); return; }
    setFakeLoading(true);
    setTimeout(() => {
      setFakeLoading(false);
      setDecoyUser({ email: authInput, name: authInput.split('@')[0] });
      setIsDecoyApp(true);
      setDecoyTab('home');
      setAuthInput(''); setPassInput('');
    }, 1500);
  };

  const handleDecoySignUp = () => {
    Keyboard.dismiss();
    const { name, email, password, confirm } = signUpData;
    if (!name || !email || !password || !confirm || password !== confirm) { showToast('warning', 'Error', 'Invalid data.'); return; }
    setFakeLoading(true);
    setTimeout(() => {
      setFakeLoading(false);
      setDecoyUser({ email, name });
      setIsDecoyApp(true);
      setDecoyTab('home');
      setShowSignUp(false);
      setSignUpData({ name: '', email: '', password: '', confirm: '' });
    }, 2000);
  };

  const handleDecoyForgot = () => {
    Keyboard.dismiss();
    setFakeLoading(true);
    setTimeout(() => {
      setFakeLoading(false);
      setShowForgot(false);
      showToast('success', 'Sent', 'Instructions sent.');
    }, 1500);
  };

  const handleDecoyLogout = () => {
    setIsDecoyApp(false);
    setDecoyUser(null);
    setAuthInput('');
    setPassInput('');
  };

  const downloadVideoUrl = async () => {
    if (!vidUrlInput.trim()) return;
    Keyboard.dismiss();
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const ext = vidUrlInput.split('.').pop().split('?')[0] || 'mp4';
      const secureName = `${generateSecureName()}.${ext}`;
      const securePath = FileSystem.documentDirectory + secureName;

      const downloadResumable = FileSystem.createDownloadResumable(vidUrlInput, securePath, {}, (dp) => {
        setDownloadProgress(Math.floor((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100));
      });

      const result = await downloadResumable.downloadAsync();
      if (result && result.uri) {
        const newItem = { id: Date.now().toString(), uri: result.uri, type: 'video', isFav: false, title: 'Intercepted Stream' };
        saveEncryptedMedia([newItem, ...media]);
        showToast('success', 'Secured', 'Stream saved to vault.');
      }
    } catch (error) {
      showToast('danger', 'Failed', 'Stream unavailable.');
    } finally {
      setIsDownloading(false);
      setVidUrlInput('');
    }
  };

  const pickMediaSecurely = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return;
      
      let result = await ImagePicker.launchImageLibraryAsync({ 
        mediaTypes: ImagePicker.MediaTypeOptions.All, 
        allowsEditing: false,
        allowsMultipleSelection: true,
        quality: 1 
      });

      if (!result.canceled && result.assets.length > 0) {
        const newItems = [];
        for (const asset of result.assets) {
          const isVideo = asset.type === 'video';
          const originalExt = asset.uri.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
          const secureName = `${generateSecureName()}.${originalExt}`;
          const securePath = FileSystem.documentDirectory + secureName;
          
          await FileSystem.copyAsync({ from: asset.uri, to: securePath });
          
          newItems.push({ 
            id: Date.now().toString() + Math.random().toString(), 
            uri: securePath, 
            type: isVideo ? 'video' : 'image', 
            isFav: false, 
            title: `Secured Asset` 
          });
        }
        
        saveEncryptedMedia([...newItems, ...media]);
        showToast('success', 'Encrypted', `${newItems.length} asset(s) secured.`);
      }
    } catch (error) {
      showToast('danger', 'Error', 'Failed to import assets.');
    }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) { setCustomIconUri(result.assets[0].uri); setIconType('custom'); }
  };

  const addNewLink = () => {
    if (!newTitle || !newUrl) return;
    let finalUrl = newUrl.startsWith('http') ? newUrl : 'https://' + newUrl;
    const newItem = { id: Date.now().toString(), title: newTitle, url: finalUrl, privacy: privacyType, iconType: iconType, customIcon: customIconUri, isFav: false };
    saveEncryptedLinks([newItem, ...links]);
    setNewTitle(''); setNewUrl(''); setPrivacyType('visible'); setIconType('auto'); setCustomIconUri('');
    setShowAddModal(false);
    showToast('success', 'Saved', 'Link encrypted successfully.');
  };

  const toggleFavorite = (type, id) => {
    if (type === 'link') {
      saveEncryptedLinks(links.map(l => l.id === id ? { ...l, isFav: !l.isFav } : l));
    } else {
      saveEncryptedMedia(media.map(m => m.id === id ? { ...m, isFav: !m.isFav } : m));
    }
  };

  const executeDelete = async () => {
    if (!confirmDel) return;
    if (confirmDel.type === 'link') {
      saveEncryptedLinks(links.filter(l => l.id !== confirmDel.id));
    } else {
      const target = media.find(m => m.id === confirmDel.id);
      if (target) { try { await FileSystem.deleteAsync(target.uri); } catch (e) { } }
      saveEncryptedMedia(media.filter(m => m.id !== confirmDel.id));
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
  const sortedMedia = [...media].sort((a, b) => (b.isFav ? 1 : 0) - (a.isFav ? 1 : 0));

  const ToastComponent = () => {
    const icons = { success: 'checkmark-circle', danger: 'close-circle', warning: 'warning', info: 'information-circle' };
    const colors = { success: COLORS.success, danger: COLORS.danger, warning: COLORS.warning, info: COLORS.accent };
    return (
      <Animated.View style={[styles.sideToast, { transform: [{ translateX: toastAnim }] }]}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setToastData({ visible: false, type: 'info', title: '', msg: '' })} style={styles.toastContent}>
          <Ionicons name={icons[toastData.type]} size={18} color={colors[toastData.type]} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.toastTitle}>{toastData.title}</Text>
            <Text style={styles.toastMsg}>{toastData.msg}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.toastBarBg}>
          <Animated.View style={[styles.toastBarFill, { backgroundColor: colors[toastData.type], width: progressAnim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }]} />
        </View>
      </Animated.View>
    );
  };

  if (!isLoggedIn && !isDecoyApp) {
    if (showSignUp) {
      return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
            <SafeAreaView style={styles.safeArea}>
              <StatusBar barStyle="light-content" />
              <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 40 }}>
                  <TouchableOpacity onPress={() => setShowSignUp(false)} style={{ marginBottom: 20 }}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></TouchableOpacity>
                  <Text style={styles.coverTitle}>Create Account</Text>
                  <View style={{ marginTop: 30 }}>
                    <Text style={styles.inputLabel}>Full Name</Text>
                    <TextInput style={styles.input} placeholder="John Doe" placeholderTextColor={COLORS.border} keyboardAppearance="dark" value={signUpData.name} onChangeText={(t) => setSignUpData({ ...signUpData, name: t })} />
                    <Text style={styles.inputLabel}>Email</Text>
                    <TextInput style={styles.input} placeholder="email@example.com" placeholderTextColor={COLORS.border} autoCapitalize="none" keyboardAppearance="dark" value={signUpData.email} onChangeText={(t) => setSignUpData({ ...signUpData, email: t })} />
                    <Text style={styles.inputLabel}>Password</Text>
                    <TextInput style={styles.input} placeholder="At least 6 characters" placeholderTextColor={COLORS.border} secureTextEntry keyboardAppearance="dark" value={signUpData.password} onChangeText={(t) => setSignUpData({ ...signUpData, password: t })} />
                    <Text style={styles.inputLabel}>Confirm Password</Text>
                    <TextInput style={styles.input} placeholder="Re-enter password" placeholderTextColor={COLORS.border} secureTextEntry keyboardAppearance="dark" value={signUpData.confirm} onChangeText={(t) => setSignUpData({ ...signUpData, confirm: t })} />
                    <TouchableOpacity style={[styles.coverBtn, { marginTop: 20 }]} onPress={handleDecoySignUp}>{fakeLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.coverBtnTxt}>Sign Up</Text>}</TouchableOpacity>
                  </View>
                </ScrollView>
              </KeyboardAvoidingView>
              <ToastComponent />
            </SafeAreaView>
          </View>
        </TouchableWithoutFeedback>
      );
    }

    if (showForgot) {
      return (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
            <SafeAreaView style={styles.safeArea}>
              <StatusBar barStyle="light-content" />
              <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <View style={{ padding: 20, paddingTop: 40 }}>
                  <TouchableOpacity onPress={() => setShowForgot(false)} style={{ marginBottom: 20 }}><Ionicons name="arrow-back" size={24} color={COLORS.text} /></TouchableOpacity>
                  <Text style={styles.coverTitle}>Reset Password</Text>
                  <View style={{ marginTop: 30 }}>
                    <Text style={styles.inputLabel}>Email Address</Text>
                    <TextInput style={styles.input} placeholder="email@example.com" placeholderTextColor={COLORS.border} autoCapitalize="none" keyboardAppearance="dark" value={authInput} onChangeText={setAuthInput} />
                    <TouchableOpacity style={[styles.coverBtn, { marginTop: 20 }]} onPress={handleDecoyForgot}>{fakeLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.coverBtnTxt}>Send Link</Text>}</TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
              <ToastComponent />
            </SafeAreaView>
          </View>
        </TouchableWithoutFeedback>
      );
    }

    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <SafeAreaView style={styles.safeArea}>
            <StatusBar barStyle="light-content" />
            <KeyboardAvoidingView style={styles.centerAll} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={styles.coverLogoBox}><Ionicons name="stats-chart" size={40} color={COLORS.primary} /></View>
              <Text style={styles.coverTitle}>NexTrade</Text>
              <Animated.View style={{ width: '100%', paddingHorizontal: 30, marginTop: 40, transform: [{ translateX: shakeAnim }] }}>
                <View style={styles.coverInputWrap}><Ionicons name="mail-outline" size={20} color={COLORS.subText} style={styles.coverInputIcon} /><TextInput style={styles.coverInput} placeholder="Email Address" placeholderTextColor={COLORS.subText} value={authInput} onChangeText={handleAuthChange} autoCapitalize="none" keyboardAppearance="dark" /></View>
                <View style={[styles.coverInputWrap, { marginTop: 15 }]}><Ionicons name="lock-closed-outline" size={20} color={COLORS.subText} style={styles.coverInputIcon} /><TextInput style={styles.coverInput} placeholder="Password" placeholderTextColor={COLORS.subText} secureTextEntry value={passInput} onChangeText={setPassInput} keyboardAppearance="dark" /></View>
                <TouchableOpacity style={{ alignSelf: 'flex-end', marginTop: 10 }} onPress={() => setShowForgot(true)}><Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: '600' }}>Forgot Password?</Text></TouchableOpacity>
                <TouchableOpacity style={styles.coverBtn} onPress={handleDecoyLogin}>{fakeLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.coverBtnTxt}>Sign In</Text>}</TouchableOpacity>
                <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 25 }}><Text style={{ color: COLORS.subText }}>New? </Text><TouchableOpacity onPress={() => setShowSignUp(true)}><Text style={{ color: COLORS.primary, fontWeight: 'bold' }}>Create Account</Text></TouchableOpacity></View>
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
              <View style={{ marginLeft: 10 }}><Text style={{ color: COLORS.subText, fontSize: 12 }}>Welcome,</Text><Text style={{ color: '#FFF', fontSize: 16, fontWeight: 'bold' }}>{decoyUser?.name || 'Investor'}</Text></View>
            </View>
            <Ionicons name="notifications-outline" size={24} color={COLORS.text} />
          </View>
          
          <ScrollView style={{ flex: 1, padding: 20 }} showsVerticalScrollIndicator={false}>
            {decoyTab === 'home' && (
              <Animated.View style={{ opacity: tabAnim, transform: [{ scale: tabAnim }] }}>
                <View style={styles.decoyBalanceCard}>
                  <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>Available Balance</Text>
                  <Text style={{ color: '#FFF', fontSize: 40, fontWeight: '900', marginVertical: 10 }}>$12,450.80</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Ionicons name="arrow-up" size={16} color={COLORS.success} />
                    <Text style={{ color: COLORS.success, fontWeight: 'bold', marginLeft: 4 }}>$1,240.12 (11.2%) Today</Text>
                  </View>
                </View>
                <View style={styles.decoySection}>
                  <Text style={styles.decoySectionTitle}>Your Portfolio</Text>
                  {['AAPL', 'TSLA', 'BTC'].map((asset, i) => (
                    <View key={asset} style={styles.decoyAssetRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={[styles.decoyAssetIcon, { backgroundColor: i === 0 ? '#333' : i === 1 ? '#222' : '#444' }]}>
                          <Ionicons name={i === 0 ? 'logo-apple' : i === 1 ? 'car' : 'logo-bitcoin'} size={20} color="#FFF" />
                        </View>
                        <View>
                          <Text style={styles.decoyAssetName}>{asset}</Text>
                          <Text style={styles.decoyAssetShares}>{i + 2} shares</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={styles.decoyAssetValue}>${(1500 * (i + 1)).toLocaleString()}</Text>
                        <Text style={{ color: i === 0 ? COLORS.success : COLORS.danger }}>{i === 0 ? '+5.2%' : '-2.1%'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={styles.decoyActionButton} onPress={() => showToast('info', 'Demo', 'Simulated platform.')}>
                  <Text style={styles.decoyActionButtonText}>Deposit Funds</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
            {decoyTab === 'market' && (
              <Animated.View style={{ opacity: tabAnim, alignItems: 'center', paddingTop: 20 }}>
                <Text style={[styles.decoySectionTitle, { marginBottom: 20 }]}>Market Overview</Text>
                <Ionicons name="bar-chart" size={120} color={COLORS.border} />
                <Text style={{ color: COLORS.subText, marginTop: 20 }}>Live market data would appear here.</Text>
              </Animated.View>
            )}
            {decoyTab === 'wallet' && (
              <Animated.View style={{ opacity: tabAnim, alignItems: 'center', paddingTop: 40 }}>
                <Ionicons name="wallet-outline" size={80} color={COLORS.border} />
                <Text style={{ color: COLORS.subText, marginTop: 20, textAlign: 'center' }}>Connect your bank account or credit card to start trading.</Text>
                <TouchableOpacity style={[styles.decoyActionButton, { marginTop: 30, backgroundColor: COLORS.card, width: '100%' }]}>
                  <Text style={styles.decoyActionButtonText}>Add Payment Method</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
            {decoyTab === 'profile' && (
              <Animated.View style={{ opacity: tabAnim, paddingTop: 20 }}>
                <View style={{ alignItems: 'center', marginVertical: 20 }}>
                  <View style={styles.decoyAvatarLarge}>
                    <Ionicons name="person" size={40} color="#FFF" />
                  </View>
                  <Text style={[styles.coverTitle, { fontSize: 22, marginTop: 15 }]}>{decoyUser?.name || 'User'}</Text>
                  <Text style={styles.coverSub}>{decoyUser?.email || 'user@example.com'}</Text>
                </View>
                <TouchableOpacity style={styles.decoyProfileItem} onPress={handleDecoyLogout}>
                  <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
                  <Text style={{ color: COLORS.danger, marginLeft: 10 }}>Sign Out</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </ScrollView>

          <View style={styles.decoyBottomNav}>
            {[
              { tab: 'home', icon: 'home', label: 'Home' },
              { tab: 'market', icon: 'bar-chart', label: 'Market' },
              { tab: 'wallet', icon: 'wallet', label: 'Wallet' },
              { tab: 'profile', icon: 'person', label: 'Profile' }
            ].map((item) => (
              <TouchableOpacity key={item.tab} style={styles.decoyNavItem} onPress={() => setDecoyTab(item.tab)}>
                <Ionicons name={decoyTab === item.tab ? item.icon : `${item.icon}-outline`} size={24} color={decoyTab === item.tab ? COLORS.primary : COLORS.subText} />
                <Text style={{ color: decoyTab === item.tab ? COLORS.primary : COLORS.subText, fontSize: 10, marginTop: 2 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
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
            <TouchableOpacity onPress={() => setActiveUrl(null)} style={styles.webviewBack}><Ionicons name="close" size={24} color={COLORS.text} /><Text style={styles.webviewBackTxt}>Close</Text></TouchableOpacity>
          </View>
          <WebView source={{ uri: activeUrl }} style={{ flex: 1, backgroundColor: COLORS.bg }} injectedJavaScript={webViewMuteJS} mediaPlaybackRequiresUserAction={true} />
          <ToastComponent />
          {showPrivacyBlur && <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />}
        </SafeAreaView>
      </View>
    );
  }

  if (activeMedia) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <SafeAreaView style={styles.safeArea}>
          <SecureMediaViewer media={activeMedia} onClose={() => setActiveMedia(null)} />
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
              <Text style={styles.vaultHeaderSub}>{vaultTab === 'links' ? links.length + ' Links' : media.length + ' Media Assets'}</Text>
            </View>
            <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.danger + '20', borderColor: 'transparent' }]} onPress={() => setIsLoggedIn(false)}><Ionicons name="power" size={20} color={COLORS.danger} /></TouchableOpacity>
          </View>

          <View style={styles.tabSwitcher}>
            <TouchableOpacity style={[styles.tabBtn, vaultTab === 'links' && styles.tabBtnActive]} onPress={() => setVaultTab('links')}><Text style={[styles.tabTxt, vaultTab === 'links' && { color: COLORS.text }]}>Encrypted Links</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, vaultTab === 'media' && styles.tabBtnActive]} onPress={() => setVaultTab('media')}><Text style={[styles.tabTxt, vaultTab === 'media' && { color: COLORS.text }]}>Secure Media</Text></TouchableOpacity>
          </View>

          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {vaultTab === 'links' && (
              <>
                <TouchableOpacity style={[styles.coverBtn, { marginTop: 0, marginBottom: 20, backgroundColor: COLORS.vaultCard, borderWidth: 1, borderColor: COLORS.vaultBorder }]} onPress={() => setShowAddModal(true)}><Ionicons name="add-circle" size={20} color={COLORS.vaultPrimary} style={{ marginRight: 8 }} /><Text style={[styles.coverBtnTxt, { color: COLORS.vaultPrimary }]}>Secure New Link</Text></TouchableOpacity>
                {sortedLinks.map(item => (
                  <View key={item.id} style={[styles.linkCard, item.isFav && { borderColor: COLORS.warning + '50', borderWidth: 1 }]}>
                    <View style={styles.linkInfo}>
                      <View style={styles.linkIconBox}>{renderIcon(item)}</View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={styles.linkTitle} numberOfLines={1}>{item.title}</Text>
                          <TouchableOpacity onPress={() => toggleFavorite('link', item.id)} style={{ padding: 5 }}><Ionicons name={item.isFav ? "star" : "star-outline"} size={20} color={item.isFav ? COLORS.warning : COLORS.subText} /></TouchableOpacity>
                        </View>
                        <Text style={[styles.linkUrl, item.privacy === 'blur' && { opacity: 0.3 }]} numberOfLines={1}>{item.privacy === 'hidden' ? '••••••••••••••••' : item.url}</Text>
                      </View>
                    </View>
                    <View style={styles.linkActions}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => copyUrl(item.url)}><Ionicons name="copy-outline" size={18} color={COLORS.subText} /></TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.danger + '15', borderColor: 'transparent' }]} onPress={() => setConfirmDel({ type: 'link', id: item.id })}><Ionicons name="trash-outline" size={18} color={COLORS.danger} /></TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: COLORS.vaultPrimary + '20', borderColor: COLORS.vaultPrimary }]} onPress={() => setActiveUrl(item.url)}><Ionicons name="open-outline" size={18} color={COLORS.vaultPrimary} /><Text style={[styles.actionTxt, { color: COLORS.vaultPrimary }]}>Connect</Text></TouchableOpacity>
                    </View>
                  </View>
                ))}
              </>
            )}

            {vaultTab === 'media' && (
              <>
                <View style={styles.downloaderCard}>
                  <Text style={styles.downloaderTitle}>Secure Asset Importer</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                    <TextInput style={[styles.input, { flex: 1, marginBottom: 0, height: 50, backgroundColor: '#050505' }]} placeholder="Direct link (.mp4)" placeholderTextColor={COLORS.border} keyboardAppearance="dark" value={vidUrlInput} onChangeText={setVidUrlInput} />
                    <TouchableOpacity style={styles.downloadBtn} onPress={downloadVideoUrl}><Ionicons name="cloud-download" size={24} color="#FFF" /></TouchableOpacity>
                  </View>
                  <TouchableOpacity style={{ alignSelf: 'center', marginTop: 15 }} onPress={pickMediaSecurely}><Text style={{ color: COLORS.subText, fontSize: 13, textDecorationLine: 'underline' }}>Import from Gallery (Multiple allowed)</Text></TouchableOpacity>
                </View>

                <View style={styles.vidGrid}>
                  {sortedMedia.map(m => (
                    <View key={m.id} style={[styles.vidWrapper, m.isFav && { borderColor: COLORS.warning, borderWidth: 1, borderRadius: 20 }]}>
                      <TouchableOpacity style={styles.vidCard} onPress={() => setActiveMedia(m)}>
                        {m.type === 'image' ? (
                           <Image source={{ uri: m.uri }} style={styles.vidThumb} resizeMode="cover" />
                        ) : (
                           <Video source={{ uri: m.uri }} style={styles.vidThumb} resizeMode="cover" shouldPlay={false} />
                        )}
                        <View style={styles.vidPlayOverlay}><Ionicons name={m.type === 'image' ? "image" : "play"} size={30} color="#FFF" /></View>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.vidFavBtn} onPress={() => toggleFavorite('media', m.id)}><Ionicons name={m.isFav ? "star" : "star-outline"} size={16} color={m.isFav ? COLORS.warning : "#FFF"} /></TouchableOpacity>
                      <TouchableOpacity style={styles.vidDelBtn} onPress={() => setConfirmDel({ type: 'media', id: m.id })}><Ionicons name="trash" size={14} color="#FFF" /></TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            )}
            <View style={{ height: 50 }} />
          </ScrollView>

          <Modal visible={isDownloading} transparent animationType="fade">
            <View style={styles.modalOverlayCen}>
              <View style={styles.confirmCard}>
                <Ionicons name="cloud-download-outline" size={50} color={COLORS.accent} style={{ marginBottom: 15 }} />
                <Text style={styles.confirmTitle}>Intercepting...</Text>
                <View style={{ width: '100%', height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginVertical: 15, overflow: 'hidden' }}><View style={{ height: '100%', width: `${downloadProgress}%`, backgroundColor: COLORS.accent }} /></View>
                <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{downloadProgress}%</Text>
              </View>
            </View>
          </Modal>

          <Modal visible={showAddModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowAddModal(false)} />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Secure Link</Text>
                  <TouchableOpacity onPress={() => setShowAddModal(false)}><Ionicons name="close" size={24} color={COLORS.subText} /></TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.inputLabel}>Asset Title</Text>
                  <TextInput style={styles.input} placeholder="Title" placeholderTextColor={COLORS.border} keyboardAppearance="dark" value={newTitle} onChangeText={setNewTitle} />
                  <Text style={styles.inputLabel}>Target URL</Text>
                  <TextInput style={styles.input} placeholder="URL" placeholderTextColor={COLORS.border} autoCapitalize="none" keyboardAppearance="dark" value={newUrl} onChangeText={setNewUrl} />
                  
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

                  <TouchableOpacity style={[styles.coverBtn, { marginTop: 10, backgroundColor: COLORS.vaultPrimary }]} onPress={addNewLink}><Text style={styles.coverBtnTxt}>Encrypt</Text></TouchableOpacity>
                  <View style={{ height: 30 }} />
                </ScrollView>
              </KeyboardAvoidingView>
            </View>
          </Modal>

          <Modal visible={!!confirmDel} transparent animationType="fade">
            <View style={styles.modalOverlayCen}>
              <View style={styles.confirmCard}>
                <Ionicons name="warning" size={55} color={COLORS.danger} style={{ marginBottom: 15 }} />
                <Text style={styles.confirmTitle}>Purge Asset?</Text>
                <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 25 }}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDel(null)}><Text style={styles.cancelBtnTxt}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.delBtn} onPress={executeDelete}><Text style={styles.delBtnTxt}>Purge</Text></TouchableOpacity>
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
  coverBtnTxt: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  decoyHeader: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  decoyAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  decoyBalanceCard: { backgroundColor: COLORS.card, padding: 25, borderRadius: 24, marginBottom: 25, borderWidth: 1, borderColor: COLORS.border },
  decoyActionButton: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  decoyActionButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
  decoySectionTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  decoyBottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20, backgroundColor: COLORS.bg, borderTopWidth: 1, borderColor: COLORS.border },
  decoyNavItem: { flex: 1, alignItems: 'center' },
  decoySection: { marginTop: 25 },
  decoyAssetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  decoyAssetIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  decoyAssetName: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  decoyAssetShares: { color: COLORS.subText, fontSize: 12 },
  decoyAssetValue: { color: COLORS.text, fontSize: 16, fontWeight: '700' },
  decoyAvatarLarge: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.border, justifyContent: 'center', alignItems: 'center' },
  decoyProfileItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  vaultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.vaultBorder },
  vaultHeaderTitle: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  vaultHeaderSub: { fontSize: 14, color: COLORS.vaultPrimary, fontWeight: '800', marginTop: 2 },
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
  linkTitle: { color: COLORS.text, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  linkUrl: { color: COLORS.subText, fontSize: 13, fontWeight: '600' },
  linkActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  actionBtn: { flex: 0.25, flexDirection: 'row', height: 42, borderRadius: 12, backgroundColor: COLORS.vaultBg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  actionTxt: { fontWeight: '800', fontSize: 13, marginLeft: 6 },
  downloaderCard: { backgroundColor: COLORS.vaultCard, borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: COLORS.vaultBorder },
  downloaderTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  downloadBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: COLORS.vaultPrimary, justifyContent: 'center', alignItems: 'center' },
  vidGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  vidWrapper: { width: (width - 55) / 2, aspectRatio: 1, marginBottom: 15 },
  vidCard: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.vaultCard, borderWidth: 1, borderColor: COLORS.vaultBorder },
  vidThumb: { width: '100%', height: '100%' },
  vidPlayOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  vidDelBtn: { position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.danger, justifyContent: 'center', alignItems: 'center' },
  vidFavBtn: { position: 'absolute', top: 10, left: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  customVideoControls: { position: 'absolute', bottom: 40, width: '100%', paddingHorizontal: 20 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  timeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  progressBarBg: { flex: 1, height: 20, justifyContent: 'center' },
  progressBarFill: { height: 6, backgroundColor: COLORS.success, borderRadius: 3 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vidControlBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  skipBtn: { alignItems: 'center', justifyContent: 'center', width: 40 },
  skipTxt: { color: '#FFF', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  captchaBox: { padding: 15, backgroundColor: COLORS.vaultBg, borderRadius: 12, width: '100%', alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: COLORS.vaultBorder },
  captchaText: { color: COLORS.text, fontSize: 24, fontWeight: '900', letterSpacing: 8, fontStyle: 'italic' },
  sideToast: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 15, width: 220, backgroundColor: '#151A25', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#232B3B', zIndex: 9999 },
  toastContent: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  toastTitle: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  toastMsg: { color: COLORS.subText, fontSize: 11, marginTop: 1 },
  toastBarBg: { width: '100%', height: 2, backgroundColor: 'rgba(255,255,255,0.05)' },
  toastBarFill: { height: '100%' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.vaultCard, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 30, paddingBottom: 50 },
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
