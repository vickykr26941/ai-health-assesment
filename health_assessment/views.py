from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
import uuid
import logging

from .models import HealthAssessment, Question, Answer, TreatmentPlan
from .serializers import (
    HealthAssessmentSerializer, StartAssessmentSerializer, 
    SubmitAnswerSerializer, QuestionSerializer, TreatmentPlanSerializer
)
from .services import ClaudeService, EKAMCPService
from .gemeni_service import GeminiService, GeminiServiceAdvanced
logger = logging.getLogger(__name__)

@api_view(['POST'])
def start_assessment(request):
    import pdb; pdb.set_trace()
    """Start a new health assessment"""
    serializer = StartAssessmentSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    data = serializer.validated_data
    session_id = data.get('session_id', str(uuid.uuid4()))
    
    try:
        with transaction.atomic():
            # Create assessment
            import pdb; pdb.set_trace()
            assessment = HealthAssessment.objects.create(
                session_id=session_id,
                initial_concern=data['initial_concern'],
                status='started'
            )
            
            # Generate initial questions using Claude
            # claude_service = ClaudeService()
            gemeni_service = GeminiService()
            # questions = claude_service.generate_initial_questions(data['initial_concern'])
            questions = gemeni_service.generate_initial_questions(data['initial_concern'])
            
            # Create question objects
            for i, question_text in enumerate(questions, 1):
                Question.objects.create(
                    assessment=assessment,
                    question_text=question_text,
                    question_order=i
                )
            
            assessment.status = 'in_progress'
            assessment.save()
            
            return Response({
                'assessment_id': assessment.id,
                'session_id': assessment.session_id,
                'questions': questions,
                'status': 'success'
            })
            
    except Exception as e:
        logger.error(f"Error starting assessment: {str(e)}")
        return Response(
            {'error': 'Failed to start assessment', 'details': str(e)}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def submit_answer(request):
    """Submit an answer to a question"""
    import pdb; pdb.set_trace()
    serializer = SubmitAnswerSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    data = serializer.validated_data
    
    try:
        question = get_object_or_404(Question, id=data['question_id'])
        
        # Create or update answer
        answer, created = Answer.objects.get_or_create(
            question=question,
            defaults={'answer_text': data['answer_text']}
        )
        
        if not created:
            answer.answer_text = data['answer_text']
            answer.save()
        
        question.is_answered = True
        question.save()
        
        # Check if we should generate a follow-up question
        assessment = question.assessment
        answered_questions = assessment.questions.filter(is_answered=True).count()
        total_questions = assessment.questions.count()
        
        next_question = None
        if answered_questions == total_questions and answered_questions < 8:  # Max 8 questions
            # Generate follow-up question
            # claude_service = ClaudeService()
            gemeni_service = GeminiService()
            # followup_question_text = claude_service.generate_followup_question(assessment)
            followup_question_text = gemeni_service.generate_followup_question(assessment)
            
            next_question = Question.objects.create(
                assessment=assessment,
                question_text=followup_question_text,
                question_order=total_questions + 1
            )
        
        return Response({
            'status': 'success',
            'message': 'Answer submitted successfully',
            'next_question': {
                'id': next_question.id,
                'text': next_question.question_text
            } if next_question else None,
            'can_finish': answered_questions >= 3  # Allow finishing after 3 questions
        })
        
    except Exception as e:
        logger.error(f"Error submitting answer: {str(e)}")
        return Response(
            {'error': 'Failed to submit answer', 'details': str(e)}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
def get_assessment(request, assessment_id):
    """Get assessment details"""
    import pdb; pdb.set_trace()
    try:
        assessment = get_object_or_404(HealthAssessment, id=assessment_id)
        serializer = HealthAssessmentSerializer(assessment)
        return Response(serializer.data)
    except Exception as e:
        logger.error(f"Error getting assessment: {str(e)}")
        return Response(
            {'error': 'Failed to get assessment'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def generate_treatment_plan(request, assessment_id):
    """Generate treatment plan for completed assessment"""
    import pdb; pdb.set_trace()
    try:
        assessment = get_object_or_404(HealthAssessment, id=assessment_id)
        
        # Check if assessment has enough answers
        answered_questions = assessment.questions.filter(is_answered=True).count()
        if answered_questions < 3:
            return Response(
                {'error': 'Not enough questions answered. Minimum 3 required.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Generate treatment plan using EKA MCP
        eka_service = EKAMCPService()
        treatment_data = eka_service.generate_treatment_plan(assessment)
        
        # Save treatment plan
        treatment_plan, created = TreatmentPlan.objects.get_or_create(
            assessment=assessment,
            defaults={
                'diagnosis': treatment_data['diagnosis'],
                'recommendations': treatment_data['recommendations'],
                'medications': treatment_data.get('medications', []),
                'lifestyle_changes': treatment_data.get('lifestyle_changes', []),
                'followup_instructions': treatment_data['followup_instructions']
            }
        )
        
        if not created:
            treatment_plan.diagnosis = treatment_data['diagnosis']
            treatment_plan.recommendations = treatment_data['recommendations']
            treatment_plan.medications = treatment_data.get('medications', [])
            treatment_plan.lifestyle_changes = treatment_data.get('lifestyle_changes', [])
            treatment_plan.followup_instructions = treatment_data['followup_instructions']
            treatment_plan.save()
        
        assessment.status = 'treatment_generated'
        assessment.save()
        
        serializer = TreatmentPlanSerializer(treatment_plan)
        return Response({
            'status': 'success',
            'treatment_plan': serializer.data
        })
        
    except Exception as e:
        logger.error(f"Error generating treatment plan: {str(e)}")
        return Response(
            {'error': 'Failed to generate treatment plan', 'details': str(e)}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
def get_next_question(request, assessment_id):
    """Get the next unanswered question"""
    import pdb; pdb.set_trace()
    try:
        import pdb; pdb.set_trace()
        assessment = get_object_or_404(HealthAssessment, id=assessment_id)
        next_question = assessment.questions.filter(is_answered=False).first()
        
        if next_question:
            serializer = QuestionSerializer(next_question)
            return Response(serializer.data)
        else:
            return Response({'message': 'No more questions'}, status=status.HTTP_204_NO_CONTENT)
            
    except Exception as e:
        logger.error(f"Error getting next question: {str(e)}")
        return Response(
            {'error': 'Failed to get next question'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    
