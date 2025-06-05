import anthropic
import requests
import json
import logging
from django.conf import settings
from typing import List, Dict, Any
from .models import HealthAssessment, Question, Answer
from .gemeni_service import GeminiService

logger = logging.getLogger(__name__)

class ClaudeService:
    def __init__(self):
        self.client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    
    def generate_initial_questions(self, concern: str) -> List[str]:
        """Generate initial questions based on the patient's concern"""
        prompt = f"""
        You are a medical AI assistant helping to conduct a health assessment. 
        A patient has expressed the following concern: "{concern}"
        
        Generate 5 relevant, specific medical questions to better understand their condition.
        The questions should be:
        1. Clear and easy to understand
        2. Medically relevant
        3. Help narrow down potential causes
        4. Appropriate for a non-medical person to answer
        
        Return only the questions, one per line, without numbering.
        """
        import pdb; pdb.set_trace()
        try:
            response = self.client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=1000,
                messages=[{"role": "user", "content": prompt}]
            )
            
            questions = [q.strip() for q in response.content[0].text.strip().split('\n') if q.strip()]
            return questions[:5]  # Ensure we get exactly 5 questions
            
        except Exception as e:
            logger.error(f"Error generating questions with Claude: {str(e)}")
            # Fallback generic questions
            return [
                "How long have you been experiencing this concern?",
                "On a scale of 1-10, how would you rate the severity?",
                "Does anything make it better or worse?",
                "Have you taken any medications for this?",
                "Do you have any family history of similar conditions?"
            ]
    
    def generate_followup_question(self, assessment: HealthAssessment) -> str:
        """Generate a follow-up question based on previous answers"""
        conversation_context = self._build_conversation_context(assessment)
        
        prompt = f"""
        You are conducting a medical assessment. Based on the following conversation:
        
        {conversation_context}
        
        Generate ONE more specific follow-up question that would help better understand 
        the patient's condition. The question should:
        1. Build on previous answers
        2. Help clarify any ambiguities
        3. Gather additional relevant information
        4. Be clear and specific
        
        Return only the question, nothing else.
        """
        
        try:
            response = self.client.messages.create(
                model="claude-3-sonnet-20240229",
                max_tokens=300,
                messages=[{"role": "user", "content": prompt}]
            )
            
            return response.content[0].text.strip()
            
        except Exception as e:
            logger.error(f"Error generating follow-up question: {str(e)}")
            return "Is there anything else about your symptoms that you think might be important?"

    def _build_conversation_context(self, assessment: HealthAssessment) -> str:
        """Build conversation context for Claude"""
        context = f"Initial concern: {assessment.initial_concern}\n\n"
        
        questions = assessment.questions.filter(is_answered=True).order_by('question_order')
        for question in questions:
            context += f"Q: {question.question_text}\n"
            if hasattr(question, 'answer'):
                context += f"A: {question.answer.answer_text}\n\n"
        
        return context

# eka mpc 
class EKAMCPService: 
    def __init__(self):
        self.base_url = settings.EKA_MCP_URL
    
    def generate_treatment_plan(self, assessment: HealthAssessment) -> Dict[str, Any]:
        """Generate treatment plan using EKA MCP server"""
        import pdb; pdb.set_trace()
        # Prepare assessment data for EKA MCP
        assessment_data = {
            "initial_concern": assessment.initial_concern,
            "questions_and_answers": [],
            "patient_info": {
                "assessment_id": str(assessment.id),
                "timestamp": assessment.created_at.isoformat()
            }
        }
        
        # Add all Q&A pairs
        questions = assessment.questions.filter(is_answered=True).order_by('question_order')
        for question in questions:
            if hasattr(question, 'answer'):
                assessment_data["questions_and_answers"].append({
                    "question": question.question_text,
                    "answer": question.answer.answer_text
                })
        
        try:
            # response = requests.post(
            #     self.base_url,
            #     json=assessment_data,
            #     headers={'Content-Type': 'application/json'},
            #     timeout=30
            # )
            gemeni_service = GeminiService()
            prompt = f"""
            You are a medical AI assistant helping to generate a treatment plan based on the following health assessment data:
            Initial concern: {assessment.initial_concern}
            Questions and answers:
            """
            for qa in assessment_data["questions_and_answers"]:
                prompt += f"Q: {qa['question']}\nA: {qa['answer']}\n"
            prompt += """
            Generate a comprehensive treatment plan that includes:
            1. Diagnosis based on the provided information
            2. Specific recommendations for the patient
            3. Any necessary medications or treatments
            4. Lifestyle changes or home remedies
            5. Follow-up instructions
            The plan should be clear, actionable, and suitable for a non-medical person to understand.

            Return the treatment plan in JSON format with the following structure:
            Do not use the below content, just the structure:          
            {
            "diagnosis": "Based on your symptoms, this appears to be a condition that may require medical evaluation. Please consult with a healthcare provider for proper diagnosis.",
            "recommendations": [
                "Schedule an appointment with your primary care physician",
                "Monitor symptoms daily and keep a symptom diary",
                "Maintain adequate hydration (8-10 glasses of water daily)",
                "Get sufficient rest (7-9 hours of sleep per night)",
                "Consider stress reduction techniques like meditation or yoga"
            ],
            "medications": [
                "Do not start any new medications without consulting your doctor",
                "Over-the-counter pain relievers may be used as needed following package instructions"
            ],
            "lifestyle_changes": [
                "Regular moderate exercise (30 minutes, 3-4 times per week)",
                "Balanced diet rich in fruits and vegetables",
                "Avoid known triggers that worsen symptoms",
                "Practice good hygiene and self-care"
            ],
            "followup_instructions": "Schedule a follow-up appointment in 1-2 weeks if symptoms persist or worsen. Seek immediate medical attention if you experience severe symptoms or if your condition deteriorates."
             }
            """

            import pdb; pdb.set_trace()
            response = gemeni_service.model.generate_content(prompt)
            if not response or not response.content:
                logger.error("EKA MCP returned empty response")
                return self._fallback_treatment_plan()
            response_content = response.content[0].text.strip()
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error(f"EKA MCP returned status {response.status_code}: {response.text}")
                return self._fallback_treatment_plan()
                
        except requests.RequestException as e:
            logger.error(f"Error calling EKA MCP service: {str(e)}")
            return self._fallback_treatment_plan()
    
    def _fallback_treatment_plan(self) -> Dict[str, Any]:
        """Fallback treatment plan if EKA MCP is unavailable"""
        return {
            "diagnosis": "Based on your symptoms, this appears to be a condition that may require medical evaluation. Please consult with a healthcare provider for proper diagnosis.",
            "recommendations": [
                "Schedule an appointment with your primary care physician",
                "Monitor symptoms daily and keep a symptom diary",
                "Maintain adequate hydration (8-10 glasses of water daily)",
                "Get sufficient rest (7-9 hours of sleep per night)",
                "Consider stress reduction techniques like meditation or yoga"
            ],
            "medications": [
                "Do not start any new medications without consulting your doctor",
                "Over-the-counter pain relievers may be used as needed following package instructions"
            ],
            "lifestyle_changes": [
                "Regular moderate exercise (30 minutes, 3-4 times per week)",
                "Balanced diet rich in fruits and vegetables",
                "Avoid known triggers that worsen symptoms",
                "Practice good hygiene and self-care"
            ],
            "followup_instructions": "Schedule a follow-up appointment in 1-2 weeks if symptoms persist or worsen. Seek immediate medical attention if you experience severe symptoms or if your condition deteriorates."
        }
