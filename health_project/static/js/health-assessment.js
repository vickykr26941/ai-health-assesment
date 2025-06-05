// # ===========================================
// # static/js/health-assessment.js
// # ===========================================
const { useState, useEffect, useRef } = React;

// Configuration
const API_BASE_URL = '/api';

// Main App Component
const HealthAssessmentApp = () => {
    const [currentStep, setCurrentStep] = useState('start');
    const [assessment, setAssessment] = useState(null);
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [treatmentPlan, setTreatmentPlan] = useState(null);
    const [isRecording, setIsRecording] = useState(false);
    const [voiceFeedback, setVoiceFeedback] = useState('');

    const speechRecognition = useRef(null);
    const [concern, setConcern] = useState('');


    // text-to-speech setups
    const speechSynthesis = useRef(null);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const currentInputSetterRef = useRef(() => {});

    // Initialize speech recognition
    useEffect(() => {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';
            
            recognition.onstart = () => {
                setIsRecording(true);
                setVoiceFeedback('🎤 Listening... Please speak clearly');
            };
            
            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                // setCurrentAnswer(transcript);
                currentInputSetterRef.current(transcript);
                setVoiceFeedback(`✓ Heard: "${transcript}"`);
            };
            
            recognition.onerror = (event) => {
                setError(`Voice recognition error: ${event.error}`);
                setVoiceFeedback('❌ Voice recognition failed. Please try again.');
            };
            
            recognition.onend = () => {
                setIsRecording(false);
            };
            
            speechRecognition.current = recognition;
        }

        if ('speechSynthesis' in window) {
            speechSynthesis.current = window.speechSynthesis;
        }
    }, []);

    // Speec to text function
    const speak = (text, callback = null) => {
        if (!speechSynthesis.current) {
            console.warn('Speech synthesis not supported');
            return;
        }
        speechSynthesis.current.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
            setIsSpeaking(false);
            if (callback) callback();
        };
        utterance.onerror = () => setIsSpeaking(false);

        speechSynthesis.current.speak(utterance);
    };


    // API calls
    const apiCall = async (endpoint, options = {}) => {
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || '',
                    ...options.headers,
                },
                ...options,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    };

    const startAssessment = async (initialConcern) => {
        setLoading(true);
        setError('');
        
        try {
            const response = await apiCall('/assessment/start/', {
                method: 'POST',
                body: JSON.stringify({
                    initial_concern: initialConcern
                })
            });

            setAssessment({
                id: response.assessment_id,
                sessionId: response.session_id,
                initialConcern: initialConcern
            });

            setQuestions(response.questions);
            setCurrentQuestion(response.questions[0]);
            setCurrentStep('assessment');

            setTimeout(() => {
                speak(`Question 1: ${response.questions[0].question_text}`);
            }, 1000);
        } catch (error) {
            setError(`Failed to start assessment: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const submitAnswer = async () => {
        if (!currentAnswer.trim()) {
            setError('Please provide an answer before continuing');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await apiCall('/answer/submit/', {
                method: 'POST',
                body: JSON.stringify({
                    question_id: currentQuestion.id,
                    answer_text: currentAnswer
                })
            });

            setAnswers(prev => ({
                ...prev,
                [currentQuestion.id]: currentAnswer
            }));

            setQuestions(prev => prev.map(q => 
                q.id === currentQuestion.id 
                    ? { ...q, is_answered: true, answer: currentAnswer }
                    : q
            ));

            if (response.next_question) {
                const newQuestion = {
                    id: response.next_question.id,
                    question_text: response.next_question.text,
                    question_order: questions.length + 1,
                    is_answered: false
                };
                
                setQuestions(prev => [...prev, newQuestion]);
                setCurrentQuestion(newQuestion);

                setTimeout(() => {
                    speak(`Question ${newQuestion.question_order}: ${newQuestion.question_text}`);
                }, 1500);
            } else {
                const nextUnanswered = questions.find(q => !q.is_answered && q.id !== currentQuestion.id);
                // setCurrentQuestion(nextUnanswered || null);
                if (nextUnanswered) {
                    setCurrentQuestion(nextUnanswered);
                    // Auto-speak next question
                    setTimeout(() => {
                        speak(`Question ${nextUnanswered.question_order}: ${nextUnanswered.question_text}`);
                    }, 1500);
                } else {
                    setCurrentQuestion(null);
                }
            }

            setCurrentAnswer('');
            setVoiceFeedback('');
        } catch (error) {
            setError(`Failed to submit answer: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const generateTreatmentPlan = async () => {
        setLoading(true);
        setError('');

        try {
            const response = await apiCall(`/treatment-plan/${assessment.id}/`, {
                method: 'POST'
            });

            setTreatmentPlan(response.treatment_plan);
            setCurrentStep('treatment');
        } catch (error) {
            setError(`Failed to generate treatment plan: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const startVoiceRecognition = () => {
        if (!speechRecognition.current) {
            setError('Voice recognition is not supported in your browser');
            return;
        }

        if (isRecording) {
            speechRecognition.current.stop();
        } else {
            speechRecognition.current.start();
        }
    };

    // Components
    const StartScreen = () => {
        // FIXED: Set voice-to-text handler for initial concern
        useEffect(() => {
            currentInputSetterRef.current = setConcern;
        }, []);
        // useEffect(() => {
        //     const timer = setTimeout(() => {
        //         speak("Welcome to Health AI Assessment. How are you feeling today? Please tell us what's troubling you.");
        //     }, 800);
        //     return () => clearTimeout(timer); 
        // }, []);

        return (
            <div className="bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20">
                <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center">
                    Tell us about your health concern
                </h2>
                <div className="mb-6">
                    <label className="block text-gray-700 font-semibold mb-3 text-lg">
                        How are you feeling today? Please tell us what's troubling you.
                    </label>
                    {/* <textarea
                        className="w-full p-4 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all duration-300 resize-none"
                        value={concern}
                        onChange={(e) => setConcern(e.target.value)}
                        placeholder="Describe your symptoms, pain, or health concerns in detail..."
                        rows="5"
                    /> */}

                    <div className="flex gap-3">
                        <textarea
                            className="flex-1 p-4 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all duration-300 resize-none"
                            value={concern}
                            onChange={(e) => setConcern(e.target.value)}
                            placeholder="Describe your symptoms, pain, or health concerns in detail..."
                            rows="4"
                        />
                        <button
                            className={`px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 ${
                                isRecording 
                                    ? 'bg-red-500 hover:bg-red-600 text-white recording-pulse' 
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:scale-105'
                            }`}
                            onClick={startVoiceRecognition}
                        >
                            <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>
                        </button>
                    </div>
                    {voiceFeedback && (
                        <div className="text-sm text-gray-600 italic bg-gray-50 mt-2 p-3 rounded-lg">
                            {voiceFeedback}
                        </div>
                    )}
                </div>
                <button
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-6 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none shadow-lg"
                    onClick={() => startAssessment(concern)}
                    disabled={!concern.trim() || loading}
                >
                    {loading ? (
                        <div className="flex items-center justify-center gap-3">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Starting Assessment...
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-3">
                            <i className="fas fa-play"></i>
                            Start Health Assessment
                        </div>
                    )}
                </button>
            </div>
        );
    };

    const AssessmentScreen = () => {
        const answeredCount = questions.filter(q => q.is_answered).length;
        const totalQuestions = questions.length;
        const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;
        const canFinish = answeredCount >= 3;

        useEffect(() => {
            currentInputSetterRef.current = setCurrentAnswer;
        }, []);

        return (
            <div className="space-y-6">
                {/* Progress Bar */}
                <div className="bg-white/95 backdrop-blur-lg rounded-3xl p-6 shadow-xl">
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-4">
                        <div 
                            className="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                    <p className="text-center text-gray-600 font-medium">
                        Question {answeredCount + 1} of {totalQuestions} 
                        {canFinish && ' • You can finish anytime now ✓'}
                    </p>
                </div>

                {/* Current Question */}
                {currentQuestion && (
                    <div className="bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-xl border border-white/20">
                        <div className="flex items-center gap-4 mb-6">
                           <div className={`w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-full flex items-center justify-center font-bold text-lg ${isSpeaking ? 'animate-pulse' : ''}`}>
                                {isSpeaking ? '🔊' : currentQuestion.question_order}
                            </div>
                            <h3 className="text-xl font-semibold text-gray-800 flex-1">
                                {currentQuestion.question_text}
                            </h3>
                            <button
                                onClick={() => speak(`Question ${currentQuestion.question_order}: ${currentQuestion.question_text}`)}
                                className="text-indigo-600 hover:text-indigo-800 p-2"
                                title="Repeat question"
                            >
                            <i className="fas fa-volume-up"></i>
                            </button>
                        </div>
                        
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <textarea
                                    className="flex-1 p-4 border-2 border-gray-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 transition-all duration-300 resize-none"
                                    value={currentAnswer}
                                    onChange={(e) => setCurrentAnswer(e.target.value)}
                                    placeholder="Type your answer here or use voice input..."
                                    rows="3"
                                />
                                <button
                                    className={`px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center gap-2 min-w-[120px] justify-center ${
                                        isRecording 
                                            ? 'bg-red-500 hover:bg-red-600 text-white recording-pulse' 
                                            : 'bg-red-500 hover:bg-red-600 text-white hover:scale-105'
                                    }`}
                                    onClick={startVoiceRecognition}
                                >
                                    <i className={`fas ${isRecording ? 'fa-stop' : 'fa-microphone'}`}></i>
                                    {isRecording ? 'Stop' : 'Voice'}
                                </button>
                            </div>
                            
                            {voiceFeedback && (
                                <div className="text-sm text-gray-600 italic bg-gray-50 p-3 rounded-lg">
                                    {voiceFeedback}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 px-6 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                                onClick={submitAnswer}
                                disabled={!currentAnswer.trim() || loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-arrow-right"></i>
                                        Next Question
                                    </>
                                )}
                            </button>
                            
                            {canFinish && (
                                <button
                                    className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-xl font-semibold transform hover:scale-105 transition-all duration-300 disabled:opacity-60 flex items-center gap-2"
                                    onClick={generateTreatmentPlan}
                                    disabled={loading}
                                >
                                    <i className="fas fa-check"></i>
                                    Finish
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Assessment Complete */}
                {!currentQuestion && canFinish && (
                    <div className="bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-xl text-center">
                        <div className="text-6xl mb-4">🎉</div>
                        <h3 className="text-2xl font-bold text-green-600 mb-4">
                            Assessment Complete!
                        </h3>
                        <p className="text-gray-600 mb-6">
                            You've answered all the questions. Ready to get your personalized treatment plan?
                        </p>
                        <button
                            className="bg-green-600 hover:bg-green-700 text-white py-4 px-8 rounded-xl font-semibold transform hover:scale-105 transition-all duration-300 disabled:opacity-60 flex items-center gap-3 mx-auto"
                            onClick={generateTreatmentPlan}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Generating Treatment Plan...
                                </>
                            ) : (
                                <>
                                    <i className="fas fa-file-medical"></i>
                                    Get Treatment Plan
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Previous Answers */}
                {answeredCount > 0 && (
                    <div className="bg-gray-50/95 backdrop-blur-lg rounded-3xl p-8 shadow-xl">
                        <h3 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                            <i className="fas fa-history"></i>
                            Your Previous Answers
                        </h3>
                        <div className="space-y-4">
                            {questions.filter(q => q.is_answered).map((question) => (
                                <div key={question.id} className="bg-white p-4 rounded-xl border-l-4 border-indigo-500">
                                    <div className="font-semibold text-gray-800 mb-2">
                                        Q{question.question_order}: {question.question_text}
                                    </div>
                                    <div className="text-gray-600 italic">
                                        A: {answers[question.id]}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const TreatmentScreen = () => {
        if (!treatmentPlan) return null;

        return (
            <div className="bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-2xl border border-white/20">
                <div className="text-center mb-8">
                    <div className="text-6xl mb-4">📋</div>
                    <h2 className="text-3xl font-bold text-green-600 mb-2">
                        Your Treatment Plan
                    </h2>
                    <p className="text-gray-600">AI-powered personalized health recommendations</p>
                </div>

                <div className="space-y-8">
                    {/* Diagnosis */}
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-200">
                        <h3 className="text-xl font-semibold text-green-800 mb-3 flex items-center gap-2">
                            <i className="fas fa-stethoscope"></i>
                            Diagnosis
                        </h3>
                        <p className="text-gray-700 leading-relaxed bg-white p-4 rounded-xl">
                            {treatmentPlan.diagnosis}
                        </p>
                    </div>

                    {/* Recommendations */}
                    {treatmentPlan.recommendations && treatmentPlan.recommendations.length > 0 && (
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-200">
                            <h3 className="text-xl font-semibold text-blue-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-clipboard-list"></i>
                                Recommendations
                            </h3>
                            <div className="space-y-3">
                                {treatmentPlan.recommendations.map((rec, index) => (
                                    <div key={index} className="bg-white p-4 rounded-xl border-l-4 border-blue-500 flex items-start gap-3">
                                        <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mt-0.5">
                                            {index + 1}
                                        </div>
                                        <p className="text-gray-700 flex-1">{rec}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Medications */}
                    {treatmentPlan.medications && treatmentPlan.medications.length > 0 && (
                        <div className="bg-gradient-to-r from-purple-50 to-violet-50 p-6 rounded-2xl border border-purple-200">
                            <h3 className="text-xl font-semibold text-purple-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-pills"></i>
                                Medications
                            </h3>
                            <div className="space-y-3">
                                {treatmentPlan.medications.map((med, index) => (
                                    <div key={index} className="bg-white p-4 rounded-xl border-l-4 border-purple-500">
                                        <p className="text-gray-700">{med}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Lifestyle Changes */}
                    {treatmentPlan.lifestyle_changes && treatmentPlan.lifestyle_changes.length > 0 && (
                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 p-6 rounded-2xl border border-orange-200">
                            <h3 className="text-xl font-semibold text-orange-800 mb-4 flex items-center gap-2">
                                <i className="fas fa-heart"></i>
                                Lifestyle Changes
                            </h3>
                            <div className="space-y-3">
                                {treatmentPlan.lifestyle_changes.map((change, index) => (
                                    <div key={index} className="bg-white p-4 rounded-xl border-l-4 border-orange-500">
                                        <p className="text-gray-700">{change}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Follow-up Instructions */}
                    <div className="bg-gradient-to-r from-red-50 to-pink-50 p-6 rounded-2xl border border-red-200">
                        <h3 className="text-xl font-semibold text-red-800 mb-3 flex items-center gap-2">
                            <i className="fas fa-calendar-check"></i>
                            Follow-up Instructions
                        </h3>
                        <p className="text-gray-700 leading-relaxed bg-white p-4 rounded-xl">
                            {treatmentPlan.followup_instructions}
                        </p>
                    </div>
                </div>

                <div className="text-center mt-8">
                    <button
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-8 rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transform hover:scale-105 transition-all duration-300 flex items-center gap-3 mx-auto"
                        onClick={() => {
                            setCurrentStep('start');
                            setAssessment(null);
                            setQuestions([]);
                            setAnswers({});
                            setCurrentAnswer('');
                            setCurrentQuestion(null);
                            setTreatmentPlan(null);
                            setError('');
                            setConcern('');
                        }}
                    >
                        <i className="fas fa-plus"></i>
                        Start New Assessment
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="text-center mb-8 bg-white/95 backdrop-blur-lg rounded-3xl p-8 shadow-2xl">
                    <div className="text-6xl mb-4">🏥</div>
                    <h1 className="text-4xl font-bold text-indigo-600 mb-2">
                        Health AI Assessment
                    </h1>
                    <p className="text-gray-600 text-lg">
                        AI-powered health assessment with personalized treatment plans
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl mb-6 flex items-center gap-3">
                        <i className="fas fa-exclamation-triangle text-red-500"></i>
                        <span>{error}</span>
                        <button 
                            onClick={() => setError('')}
                            className="ml-auto text-red-500 hover:text-red-700"
                        >
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                )}

                {/* Main Content */}
                {currentStep === 'start' && <StartScreen />}
                {currentStep === 'assessment' && <AssessmentScreen />}
                {currentStep === 'treatment' && <TreatmentScreen />}
            </div>
        </div>
    );
};

ReactDOM.render(<HealthAssessmentApp />, document.getElementById('root'));

// # ===========================================
// # DJANGO DEPLOYMENT STEPS
// # ===========================================

// """
// STEP 1: Create Directory Structure
// ----------------------------------
// health_project/
// ├── manage.py
// ├── requirements.txt
// ├── .env
// ├── health_project/
// │   ├── __init__.py
// │   ├── settings.py
// │   ├── urls.py
// │   └── wsgi.py
// ├── health_assessment/
// │   ├── __init__.py
// │   ├── models.py
// │   ├── views.py
// │   ├── serializers.py
// │   ├── services.py
// │   ├── urls.py
// │   ├── admin.py
// │   └── apps.py
// ├── templates/
// │   └── index.html
// └── static/
//     └── js/
//         └── health-assessment.js

// STEP 2: Setup Environment
// -------------------------
// 1. Create virtual environment:
//    python -m venv health_env
//    source health_env/bin/activate  # On Windows: health_env\Scripts\activate

// 2. Install dependencies:
//    pip install -r requirements.txt

// 3. Create .env file with your API keys:
//    DEBUG=True
//    SECRET_KEY=your-secret-key-here
//    ANTHROPIC_API_KEY=your-anthropic-api-key
//    EKA_MCP_URL=http://localhost:8080/api/treatment
//    REDIS_URL=redis://localhost:6379/0

// STEP 3: Database Setup
// ----------------------
// python manage.py makemigrations
// python manage.py migrate
// python manage.py createsuperuser

// STEP 4: Create Static Files
// ---------------------------
// 1. Create templates/index.html (use the Django template above)
// 2. Create static/js/health-assessment.js (use the React code above)

// STEP 5: Update Settings (if needed)
// -----------------------------------
// # Add to settings.py if not already present:
// STATICFILES_DIRS = [BASE_DIR / 'static']

// STEP 6: Run Development Server
// ------------------------------
// python manage.py runserver

// Visit: http://localhost:8000

// STEP 7: Production Deployment
// -----------------------------
// 1. Update settings for production:
//    - Set DEBUG=False
//    - Configure ALLOWED_HOSTS
//    - Use PostgreSQL instead of SQLite
//    - Configure static files serving

// 2. Collect static files:
//    python manage.py collectstatic

// 3. Use production server:
//    gunicorn health_project.wsgi:application

// STEP 8: Features Included
// -------------------------
// ✅ Voice-to-text input for all questions
// ✅ Manual text input option
// ✅ Real-time progress tracking
// ✅ Dynamic follow-up questions
// ✅ Comprehensive treatment plans
// ✅ Responsive design with Tailwind CSS
// ✅ Error handling and user feedback
// ✅ Session management
// ✅ Professional medical UI/UX

// STEP 9: Browser Compatibility
// -----------------------------
// - Chrome/Chromium: Full support
// - Firefox: Full support
// - Safari: Full support
// - Edge: Full support
// - Mobile browsers: Full support

// STEP 10: Voice Recognition Notes
// --------------------------------
// - Requires HTTPS in production
// - Works in all modern browsers
// - Automatic fallback to text input
// - Clear user feedback for voice status
// """